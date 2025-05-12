import { Duration } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { IVpc, Peer } from 'aws-cdk-lib/aws-ec2';
import { IEcsLoadBalancerTarget } from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface AlbProps {
  vpc: IVpc;
  allowedIPv4Cidrs?: string[];
  allowedIPv6Cidrs?: string[];

  subDomain: string;

  /**
   * @default custom domain and TLS is not configured.
   */
  hostedZone?: IHostedZone;

  accessLogBucket: IBucket;

  /**
   * If true, the alb is deployed to private or isolated subnet.
   * @default false
   */
  internal?: boolean;
}

export interface IAlb {
  url: string;
  addEcsService(
    id: string,
    ecsService: IEcsLoadBalancerTarget,
    port: number,
    healthCheckPath: string,
    paths: string[],
  ): void;
}

export class Alb extends Construct implements IAlb {
  public url: string;

  private listenerPriority = 1;
  private listener: ApplicationListener;
  private vpc: IVpc;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    const {
      vpc,
      subDomain,
      accessLogBucket,
      allowedIPv4Cidrs = ['0.0.0.0/0'],
      allowedIPv6Cidrs = ['::/0'],
      internal = false,
    } = props;
    const protocol = props.hostedZone ? ApplicationProtocol.HTTPS : ApplicationProtocol.HTTP;
    const certificate = props.hostedZone
      ? new Certificate(this, 'Certificate', {
          domainName: `${subDomain}.${props.hostedZone.zoneName}`,
          validation: CertificateValidation.fromDns(props.hostedZone),
        })
      : undefined;

    const alb = new ApplicationLoadBalancer(this, 'Resource', {
      vpc,
      vpcSubnets: vpc.selectSubnets({
        subnets: internal ? vpc.privateSubnets.concat(vpc.isolatedSubnets) : vpc.publicSubnets,
      }),
      internetFacing: !internal,
      idleTimeout: Duration.seconds(600),
    });
    alb.logAccessLogs(accessLogBucket, 'dify-alb');
    this.url = `${protocol.toLowerCase()}://${alb.loadBalancerDnsName}`;

    const listener = alb.addListener('Listener', {
      protocol,
      open: false,
      defaultAction: ListenerAction.fixedResponse(400),
      certificates: certificate ? [certificate] : undefined,
    });
    allowedIPv4Cidrs.forEach((cidr) => listener.connections.allowDefaultPortFrom(Peer.ipv4(cidr)));
    allowedIPv6Cidrs.forEach((cidr) => listener.connections.allowDefaultPortFrom(Peer.ipv6(cidr)));

    if (props.hostedZone) {
      new ARecord(this, 'AliasRecord', {
        zone: props.hostedZone,
        recordName: subDomain,
        target: RecordTarget.fromAlias(new LoadBalancerTarget(alb)),
      });
      this.url = `${protocol.toLowerCase()}://${subDomain}.${props.hostedZone.zoneName}`;
    }

    this.vpc = vpc;
    this.listener = listener;
  }

  public addEcsService(
    id: string,
    ecsService: IEcsLoadBalancerTarget,
    port: number,
    healthCheckPath: string,
    paths: string[],
  ) {
    const group = new ApplicationTargetGroup(this, `${id}TargetGroup`, {
      vpc: this.vpc,
      targets: [ecsService],
      protocol: ApplicationProtocol.HTTP,
      port,
      deregistrationDelay: Duration.seconds(10),
      healthCheck: {
        path: healthCheckPath,
        interval: Duration.seconds(30),
        healthyHttpCodes: '200-299,307',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
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
