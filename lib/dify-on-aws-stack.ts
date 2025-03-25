import * as cdk from 'aws-cdk-lib';
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
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { createVpc } from './constructs/vpc';
import { EnvironmentProps } from './environment-props';
import { EmailService } from './constructs/email';

/**
 * Mostly inherited from EnvironmentProps
 */
export interface DifyOnAwsStackProps extends cdk.StackProps, Omit<EnvironmentProps, 'awsRegion' | 'awsAccount'> {
  readonly cloudFrontWebAclArn?: string;
  readonly cloudFrontCertificate?: ICertificate;
}

export class DifyOnAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DifyOnAwsStackProps) {
    super(scope, id, { ...props, description: 'Dify on AWS (uksb-zea0rh9k0v)' });

    const {
      difyImageTag: imageTag = 'latest',
      difySandboxImageTag: sandboxImageTag = 'latest',
      difyPluginDaemonImageTag: pluginDaemonImageTag = 'main-local',
      allowAnySyscalls = false,
      useCloudFront = true,
      internalAlb = false,
      useFargateSpot = false,
      subDomain = 'dify',
    } = props;

    if (props.vpcId && (props.vpcIsolated != null || props.useNatInstance != null)) {
      throw new Error(
        `When you import an existing VPC (${props.vpcId}), you cannot set useNatInstance or vpcIsolated properties!`,
      );
    }

    if (useCloudFront && props.internalAlb != null) {
      throw new Error(`You cannot set internalAlb property when useCloudFront is true!`);
    }

    if (props.domainName == null && props.subDomain != null) {
      throw new Error('You cannot set subDomain property without domainName!');
    }

    if (props.setupEmail && props.domainName == null) {
      throw new Error('You cannot enable setupEmailServer without domainName!');
    }

    {
      const filtered = (props.additionalEnvironmentVariables ?? [])
        .map((v) => v.value)
        .filter((v) => typeof v != 'string' && 'secretName' in v)
        .filter((v) => /-......$/.test(v.secretName))
        .map((v) => v.secretName);
      if (filtered.length > 0) {
        // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_secretsmanager.Secret.html#static-fromwbrsecretwbrnamewbrv2scope-id-secretname
        throw new Error(`secretName cannot ends with a hyphen and 6 characters! ${filtered.join(', ')}`);
      }
    }

    if (!props.useCloudFront && props.domainName == null && !internalAlb) {
      cdk.Annotations.of(this).addWarningV2(
        'Dify:albWithoutEncryption',
        'You are exposing ALB to the Internet without TLS encryption. It is recommended to set useCloudFront: true or domainName property.',
      );
    }

    const hostedZone = props.domainName
      ? HostedZone.fromLookup(this, 'HostedZone', {
          domainName: props.domainName,
        })
      : undefined;

    const vpc = createVpc(this, {
      vpcId: props.vpcId,
      useNatInstance: props.useNatInstance,
      isolated: props.vpcIsolated,
    });

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
          subDomain,
        })
      : new Alb(this, 'Alb', {
          vpc,
          allowedIPv4Cidrs: props.allowedIPv4Cidrs,
          allowedIPv6Cidrs: props.allowedIPv6Cidrs,
          hostedZone,
          accessLogBucket,
          internal: internalAlb,
          subDomain,
        });

    const email =
      hostedZone && props.setupEmail
        ? new EmailService(this, 'Email', {
            hostedZone,
          })
        : undefined;

    let customRepository = props.customEcrRepositoryName
      ? Repository.fromRepositoryName(this, 'CustomRepository', props.customEcrRepositoryName)
      : undefined;

    new ApiService(this, 'ApiService', {
      cluster,
      alb,
      postgres,
      redis,
      storageBucket,
      email,
      imageTag,
      sandboxImageTag,
      pluginDaemonImageTag,
      allowAnySyscalls,
      customRepository,
      additionalEnvironmentVariables: props.additionalEnvironmentVariables,
      autoMigration: true,
      useFargateSpot,
    });

    new WebService(this, 'WebService', {
      cluster,
      alb,
      imageTag,
      customRepository,
      additionalEnvironmentVariables: props.additionalEnvironmentVariables,
      useFargateSpot,
    });

    new cdk.CfnOutput(this, 'DifyUrl', {
      value: alb.url,
    });
  }
}
