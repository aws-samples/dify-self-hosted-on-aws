import * as cdk from 'aws-cdk-lib';
import { IVpc, InstanceClass, InstanceSize, InstanceType, NatProvider, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerInsights } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { Postgres } from './constructs/postgres';
import { Redis } from './constructs/redis';
import { BlockPublicAccess, Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { WebService } from './constructs/dify-services/web';
import { ApiService } from './constructs/dify-services/api';
import { Alb } from './constructs/alb';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { AlbWithCloudFront } from './constructs/alb-with-cloudfront';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { VpcEndpoints } from './constructs/vpc-endpoints';
import { Repository } from 'aws-cdk-lib/aws-ecr';

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
  readonly internalAlb?: boolean;
  readonly customEcrRepositoryName?: string;
}

export class DifyOnAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DifyOnAwsStackProps) {
    super(scope, id, { ...props, description: 'Dify on AWS (uksb-zea0rh9k0v)' });

    const {
      difyImageTag: imageTag = 'latest',
      difySandboxImageTag: sandboxImageTag = 'latest',
      allowAnySyscalls = false,
      useCloudFront = true,
      internalAlb = false,
    } = props;

    let vpc: IVpc;
    if (props.vpcId != null) {
      vpc = Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId });
    } else if (internalAlb) {
      vpc = new Vpc(this, 'Vpc', {
        maxAzs: 2,
        subnetConfiguration: [
          {
            subnetType: SubnetType.PRIVATE_ISOLATED,
            name: 'Isolated',
          },
        ],
      });
    } else {
      vpc = new Vpc(this, 'Vpc', {
        ...(props.cheapVpc
          ? {
              natGatewayProvider: NatProvider.instanceV2({
                instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.NANO),
                associatePublicIpAddress: true,
              }),
              natGateways: 1,
            }
          : {}),
        maxAzs: 2,
        subnetConfiguration: [
          {
            subnetType: SubnetType.PUBLIC,
            name: 'Public',
            mapPublicIpOnLaunch: false,
          },
          {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
            name: 'Private',
          },
        ],
      });
    }

    if (internalAlb) {
      new VpcEndpoints(this, 'VpcEndpoints', { vpc });
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
      containerInsightsV2: ContainerInsights.ENABLED,
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
          internal: internalAlb,
        });

    let customRepository = props.customEcrRepositoryName
      ? Repository.fromRepositoryName(this, 'CustomRepository', props.customEcrRepositoryName)
      : undefined;

    new ApiService(this, 'ApiService', {
      cluster,
      alb,
      postgres,
      redis,
      storageBucket,
      imageTag,
      sandboxImageTag,
      allowAnySyscalls,
      customRepository,
    });

    new WebService(this, 'WebService', {
      cluster,
      alb,
      imageTag,
      customRepository,
    });

    new cdk.CfnOutput(this, 'DifyUrl', {
      value: alb.url,
    });
  }
}
