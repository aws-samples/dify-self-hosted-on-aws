import * as cdk from 'aws-cdk-lib';
import { IVpc, InstanceClass, InstanceSize, InstanceType, NatProvider, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { Postgres } from './constructs/postgres';
import { Redis } from './constructs/redis';
import { BlockPublicAccess, Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { WebService } from './constructs/dify-services/web';
import { ApiService } from './constructs/dify-services/api';
import { WorkerService } from './constructs/dify-services/worker';
import { Alb } from './constructs/alb';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { AlbWithCloudFront } from './constructs/alb-with-cloudfront';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';

/**
 * Mostly inherited from EnvironmentProps
 */
export interface DifyOnAwsStackProps extends cdk.StackProps {
  readonly allowedIPv4Cidrs?: string[];
  readonly allowedIPv6Cidrs?: string[];
  readonly cheapVpc?: boolean;
  readonly vpcId?: string;
  readonly domainName?: string;
  readonly isRedisMultiAz?: boolean;
  readonly enableAuroraScalesToZero?: boolean;
  readonly difyImageTag?: string;
  readonly difySandboxImageTag?: string;
  readonly allowAnySyscalls?: boolean;
  readonly useCloudFront?: boolean;
  readonly cloudFrontWebAclArn?: string;
  readonly cloudFrontCertificate?: ICertificate;
}

export class DifyOnAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DifyOnAwsStackProps) {
    super(scope, id, { ...props, description: 'Dify on AWS (uksb-zea0rh9k0v)' });

    const {
      difyImageTag: imageTag = 'latest',
      difySandboxImageTag: sandboxImageTag = 'latest',
      allowAnySyscalls = false,
      useCloudFront = true,
    } = props;

    let vpc: IVpc;
    if (props.vpcId != null) {
      vpc = Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId });
    } else {
      vpc = new Vpc(this, 'Vpc', {
        ...(props.cheapVpc
          ? {
              natGatewayProvider: NatProvider.instanceV2({
                instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.NANO),
              }),
              natGateways: 1,
            }
          : {}),
        maxAzs: 2,
        subnetConfiguration: [
          {
            subnetType: SubnetType.PUBLIC,
            name: 'Public',
            // NAT instance does not work when this set to false.
            // mapPublicIpOnLaunch: false,
          },
          {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
            name: 'Private',
          },
        ],
      });
    }

    if (!props.useCloudFront && props.domainName == null) {
      cdk.Annotations.of(this).addWarningV2(
        'ALBWithoutEncryption',
        'You are exposing ALB to the Internet without TLS encryption. Recommended to set useCloudFront: true or domainName property.',
      );
    }

    const hostedZone = props.domainName
      ? HostedZone.fromLookup(this, 'HostedZone', {
          domainName: props.domainName,
        })
      : undefined;

    const accessLogBucket = new Bucket(this, 'AccessLogBucket', {
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      autoDeleteObjects: true,
    });

    const cluster = new Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    });

    const postgres = new Postgres(this, 'Postgres', {
      vpc,
      scalesToZero: props.enableAuroraScalesToZero ?? false,
    });

    const redis = new Redis(this, 'Redis', { vpc, multiAz: props.isRedisMultiAz ?? true });

    const storageBucket = new Bucket(this, 'StorageBucket', {
      autoDeleteObjects: true,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    const alb = useCloudFront
      ? new AlbWithCloudFront(this, 'Alb', {
          vpc,
          hostedZone,
          accessLogBucket,
          cloudFrontCertificate: props.cloudFrontCertificate,
          cloudFrontWebAclArn: props.cloudFrontWebAclArn,
        })
      : new Alb(this, 'Alb', {
          vpc,
          allowedIPv4Cidrs: props.allowedIPv4Cidrs,
          allowedIPv6Cidrs: props.allowedIPv6Cidrs,
          hostedZone,
          accessLogBucket,
        });

    const api = new ApiService(this, 'ApiService', {
      cluster,
      alb,
      postgres,
      redis,
      storageBucket,
      imageTag,
      sandboxImageTag,
      allowAnySyscalls,
    });

    new WebService(this, 'WebService', {
      cluster,
      alb,
      imageTag,
    });

    new WorkerService(this, 'WorkerService', {
      cluster,
      postgres,
      redis,
      storageBucket,
      encryptionSecret: api.encryptionSecret,
      imageTag,
    });

    new cdk.CfnOutput(this, 'DifyUrl', {
      value: alb.url,
    });
  }
}
