import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { CfnReplicationGroup, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface RedisProps {
  vpc: ec2.IVpc;
  multiAz: boolean;
}

export class Redis extends Construct implements ec2.IConnectable {
  readonly endpoint: string;
  public connections: ec2.Connections;
  public readonly secret: Secret;
  public readonly port: number = 6379;
  public readonly brokerUrl: StringParameter;

  constructor(scope: Construct, id: string, props: RedisProps) {
    super(scope, id);

    const { vpc, multiAz } = props;

    const subnetGroup = new CfnSubnetGroup(this, 'SubnetGroup', {
      subnetIds: vpc.privateSubnets.map(({ subnetId }) => subnetId),
      description: 'private subnet',
    });

    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
    });

    const secret = new Secret(this, 'AuthToken', {
      generateSecretString: {
        passwordLength: 30,
        excludePunctuation: true,
      },
    });

    const redis = new CfnReplicationGroup(this, 'Resource', {
      engine: 'Redis',
      cacheNodeType: 'cache.t4g.micro',
      engineVersion: '7.1',
      port: this.port,
      replicasPerNodeGroup: multiAz ? 1 : 0,
      numNodeGroups: 1,
      replicationGroupDescription: 'Dify redis cluster',
      cacheSubnetGroupName: subnetGroup.ref,
      automaticFailoverEnabled: multiAz,
      multiAzEnabled: multiAz,
      securityGroupIds: [securityGroup.securityGroupId],
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      authToken: secret.secretValue.unsafeUnwrap(),
    });

    this.endpoint = redis.attrPrimaryEndPointAddress;

    this.brokerUrl = new StringParameter(this, 'BrokerUrl', {
      stringValue: `rediss://:${secret.secretValue.unsafeUnwrap()}@${this.endpoint}:${this.port}/1`,
    });

    this.connections = new ec2.Connections({ securityGroups: [securityGroup], defaultPort: ec2.Port.tcp(this.port) });
    this.secret = secret;
  }
}
