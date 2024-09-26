import { Duration } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { IVpc, Peer, Port } from 'aws-cdk-lib/aws-ec2';
import { FargateService, IService } from 'aws-cdk-lib/aws-ecs';
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
import { Construct } from 'constructs';

export interface AlbProps {
  vpc: IVpc;
  allowedCidrs: string[];

  /**
   * @default 'dify'
   */
  subDomain?: string;

  /**
   * @default custom domain and TLS is not configured.
   */
  hostedZone?: IHostedZone;
}

export class Alb extends Construct {
  public url: string;

  private listenerPriority = 1;
  private listener: ApplicationListener;
  private vpc: IVpc;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    const { vpc, subDomain = 'dify' } = props;
    const protocol = props.hostedZone ? ApplicationProtocol.HTTPS : ApplicationProtocol.HTTP;
    const certificate = props.hostedZone
      ? new Certificate(this, 'Certificate', {
          domainName: `${subDomain}.${props.hostedZone.zoneName}`,
          validation: CertificateValidation.fromDns(props.hostedZone),
        })
      : undefined;

    const alb = new ApplicationLoadBalancer(this, 'Resource', {
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnets: vpc.publicSubnets }),
      internetFacing: true,
    });
    this.url = `${protocol.toLowerCase()}://${alb.loadBalancerDnsName}`;

    const listener = alb.addListener('Listener', {
      protocol,
      open: false,
      defaultAction: ListenerAction.fixedResponse(400),
      certificates: certificate ? [certificate] : undefined,
    });
    props.allowedCidrs.forEach((cidr) => listener.connections.allowDefaultPortFrom(Peer.ipv4(cidr)));

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

  public addEcsService(id: string, ecsService: FargateService, port: number, healthCheckPath: string, paths: string[]) {
    const group = new ApplicationTargetGroup(this, `${id}TargetGroup`, {
      vpc: this.vpc,
      targets: [ecsService],
      protocol: ApplicationProtocol.HTTP,
      port: port,
      deregistrationDelay: Duration.seconds(10),
      healthCheck: {
        path: healthCheckPath,
        interval: Duration.seconds(15),
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
