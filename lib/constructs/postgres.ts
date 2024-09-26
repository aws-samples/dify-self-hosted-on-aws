import { Construct } from 'constructs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Connections, IConnectable, IVpc } from 'aws-cdk-lib/aws-ec2';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { TimeSleep } from 'cdk-time-sleep';

export interface PostgresProps {
  vpc: IVpc;

  /**
   * If true, create an bastion instance.
   * @default false
   */
  createBastion?: boolean;
}

export class Postgres extends Construct implements IConnectable {
  public readonly connections: Connections;
  public readonly cluster: rds.DatabaseCluster;
  public readonly secret: ISecret;
  public readonly databaseName = 'main';
  public readonly pgVectorDatabaseName = 'pgvector';

  private readonly queries: AwsCustomResource[] = [];
  private readonly writerId = 'Writer';

  constructor(scope: Construct, id: string, props: PostgresProps) {
    super(scope, id);

    const { vpc } = props;

    const cluster = new rds.DatabaseCluster(this, 'Cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_5,
      }),
      vpc,
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2.0,
      writer: rds.ClusterInstance.serverlessV2(this.writerId, {
        autoMinorVersionUpgrade: true,
        publiclyAccessible: false,
      }),
      defaultDatabaseName: this.databaseName,
      enableDataApi: true,
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    if (props.createBastion) {
      const host = new ec2.BastionHostLinux(this, 'BastionHost', {
        vpc,
        machineImage: ec2.MachineImage.latestAmazonLinux2023({ cpuType: ec2.AmazonLinuxCpuType.ARM_64 }),
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
        blockDevices: [
          {
            deviceName: '/dev/sdf',
            volume: ec2.BlockDeviceVolume.ebs(8, {
              encrypted: true,
            }),
          },
        ],
      });

      new CfnOutput(this, 'PortForwardCommand', {
        value: `aws ssm start-session --region ${Stack.of(this).region} --target ${
          host.instanceId
        } --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"portNumber":["${
          cluster.clusterEndpoint.port
        }"], "localPortNumber":["${cluster.clusterEndpoint.port}"], "host": ["${cluster.clusterEndpoint.hostname}"]}'`,
      });
      new CfnOutput(this, 'DatabaseSecretsCommand', {
        value: `aws secretsmanager get-secret-value --secret-id ${cluster.secret!.secretName} --region ${Stack.of(this).region}`,
      });
    }

    this.connections = cluster.connections;
    this.cluster = cluster;
    this.secret = cluster.secret!;

    this.runQuery(`CREATE DATABASE ${this.pgVectorDatabaseName};`, undefined);
    this.runQuery('CREATE EXTENSION IF NOT EXISTS vector;', this.pgVectorDatabaseName);
  }

  private runQuery(sql: string, database: string | undefined) {
    const cluster = this.cluster;
    const query = new AwsCustomResource(this, `Query${this.queries.length}`, {
      onUpdate: {
        // will also be called for a CREATE event
        service: 'rds-data',
        action: 'ExecuteStatement',
        parameters: {
          resourceArn: cluster.clusterArn,
          secretArn: cluster.secret!.secretArn,
          database: database,
          sql: sql,
        },
        physicalResourceId: PhysicalResourceId.of(cluster.clusterArn),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [cluster.clusterArn] }),
    });
    cluster.secret!.grantRead(query);
    cluster.grantDataApiAccess(query);
    if (this.queries.length > 0) {
      // We assume each query must be called serially, not in parallel.
      query.node.defaultChild!.node.addDependency(this.queries.at(-1)!.node.defaultChild!);
    } else {
      // When the Data API is called immediately after the writer creation, we got the below error:
      // > Message returned: HttpEndpoint is not enabled for resource ...
      // So we wait a minute after the creation before the first Data API call.
      const sleep = new TimeSleep(this, 'WaitForHttpEndpointReady', {
        createDuration: Duration.seconds(60),
      });
      const dbInstance = this.cluster.node.findChild(this.writerId).node.defaultChild!;
      sleep.node.defaultChild!.node.addDependency(dbInstance);
      query.node.defaultChild!.node.addDependency(sleep);
    }
    this.queries.push(query);
    return query;
  }
}
