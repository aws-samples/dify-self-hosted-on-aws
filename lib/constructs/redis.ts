import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {
  CfnReplicationGroup,
  CfnServerlessCache,
  CfnSubnetGroup,
  CfnUser,
  CfnUserGroup,
} from 'aws-cdk-lib/aws-elasticache';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Lazy, Names } from 'aws-cdk-lib';

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

    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
    });

    const secret = new Secret(this, 'AuthToken', {
      generateSecretString: {
        passwordLength: 30,
        excludePunctuation: true,
      },
    });

    const user = new CfnUser(this, 'User', {
      accessString: 'on ~* +@all',
      passwords: [secret.secretValue.unsafeUnwrap()],
      engine: 'redis',
      userId: 'placeholder',
      // User group needs to contain a user with the user name default.
      userName: 'default',
    });
    // UserId must begin with a letter; must contain only lowercase ASCII letters,
    // digits, and hyphens; and must not end with a hyphen or contain two consecutive hyphens
    user.userId = Names.uniqueResourceName(user, { maxLength: 32, separator: '-' }).toLowerCase();

    const userGroup = new CfnUserGroup(this, 'UserGroup', {
      // When using RBAC with Valkey clusters, you will still need to assign users and user groups the engine “redis”.
      // https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.RBAC.html
      engine: 'redis',
      userIds: [user.ref],
      userGroupId: 'placeholder',
    });
    userGroup.userGroupId = Names.uniqueResourceName(userGroup, { maxLength: 32, separator: '-' }).toLowerCase();

    const cluster = new CfnServerlessCache(this, 'Default', {
      engine: 'Valkey',
      serverlessCacheName: Names.uniqueResourceName(this, { maxLength: 32, separator: '-' }),
      description: 'Dify redis cluster',
      majorEngineVersion: '7',
      securityGroupIds: [securityGroup.securityGroupId],
      subnetIds: vpc.privateSubnets.map(({ subnetId }) => subnetId),
      userGroupId: userGroup.ref,
    });

    this.endpoint = cluster.attrEndpointAddress;

    this.brokerUrl = new StringParameter(this, 'BrokerUrl', {
      stringValue: `rediss://${user.userName}:${secret.secretValue.unsafeUnwrap()}@${this.endpoint}:${
        cluster.attrEndpointPort
      }/0`,
    });

    this.connections = new ec2.Connections({ securityGroups: [securityGroup], defaultPort: ec2.Port.tcp(6379) });
    this.secret = secret;
  }
}
