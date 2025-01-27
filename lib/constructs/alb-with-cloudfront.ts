import { Duration } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { LoadBalancerV2Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { IVpc, Peer } from 'aws-cdk-lib/aws-ec2';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { IAlb } from './alb';

export interface AlbProps {
  vpc: IVpc;

  /**
   * @default 'dify'
   */
  subDomain?: string;

  /**
   * @default custom domain and TLS is not configured.
   */
  hostedZone?: IHostedZone;

  accessLogBucket: IBucket;

  cloudFrontCertificate?: ICertificate;

  cloudFrontWebAclArn?: string;
}

export class AlbWithCloudFront extends Construct implements IAlb {
  public url: string;

  private listenerPriority = 1;
  private listener: ApplicationListener;
  private vpc: IVpc;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    const { vpc, subDomain = 'dify', accessLogBucket } = props;
    const protocol = ApplicationProtocol.HTTP;

    const alb = new ApplicationLoadBalancer(this, 'Resource', {
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnets: vpc.publicSubnets }),
      internetFacing: true,
    });
    alb.logAccessLogs(accessLogBucket, 'dify-alb');
    this.url = `${protocol.toLowerCase()}://${alb.loadBalancerDnsName}`;

    const listener = alb.addListener('Listener', {
      protocol,
      open: false,
      defaultAction: ListenerAction.fixedResponse(400),
    });
    // TODO: Use VPC Origins
    ['0.0.0.0/0'].forEach((cidr) => listener.connections.allowDefaultPortFrom(Peer.ipv4(cidr)));

    let distribution = new Distribution(this, 'Distribution', {
      ...(props.hostedZone
        ? {
            domainNames: [`${subDomain}.${props.hostedZone.zoneName}`],
            certificate: props.cloudFrontCertificate,
          }
        : {}),
      webAclId: props.cloudFrontWebAclArn,
      defaultBehavior: {
        origin: new LoadBalancerV2Origin(alb, { protocolPolicy: OriginProtocolPolicy.HTTP_ONLY }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        cachePolicy: CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS_QUERY_STRINGS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },
      logBucket: accessLogBucket,
      logFilePrefix: 'dify-cloudfront/',
    });
    this.url = `https://${distribution.domainName}`;

    if (props.hostedZone) {
      new ARecord(this, 'AliasRecord', {
        zone: props.hostedZone,
        recordName: subDomain,
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      });
      this.url = `https://${subDomain}.${props.hostedZone.zoneName}`;
    }

    this.vpc = vpc;
    this.listener = listener;
  }

  public addEcsService(id: string, ecsService: FargateService, port: number, healthCheckPath: string, paths: string[]) {
    const group = new ApplicationTargetGroup(this, `${id}TargetGroup`, {
      vpc: this.vpc,
      targets: [ecsService],
      protocol: ApplicationProtocol.HTTP,
      port: port,
      deregistrationDelay: Duration.seconds(10),
      healthCheck: {
        path: healthCheckPath,
        interval: Duration.seconds(20),
        healthyHttpCodes: '200-299,307',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 6,
      },
    });
    // a condition only accepts an array with up to 5 elements
    // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-limits.html
    for (let i = 0; i < Math.floor((paths.length + 4) / 5); i++) {
      const slice = paths.slice(i * 5, (i + 1) * 5);
      this.listener.addTargetGroups(`${id}${i}`, {
        targetGroups: [group],
        conditions: [ListenerCondition.pathPatterns(slice)],
        priority: this.listenerPriority++,
      });
    }
  }
}
