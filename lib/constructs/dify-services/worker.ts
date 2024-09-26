import { CpuArchitecture, FargateTaskDefinition, ICluster } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { Stack, aws_ecs as ecs } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Postgres } from '../postgres';
import { Redis } from '../redis';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';

export interface WorkerServiceProps {
  cluster: ICluster;

  postgres: Postgres;
  redis: Redis;
  storageBucket: IBucket;
  encryptionSecret: ISecret;

  imageTag: string;

  /**
   * If true, enable debug outputs
   * @default false
   */
  debug?: boolean;
}

export class WorkerService extends Construct {
  constructor(scope: Construct, id: string, props: WorkerServiceProps) {
    super(scope, id);

    const { cluster, postgres, redis, storageBucket, debug = false } = props;

    const taskDefinition = new FargateTaskDefinition(this, 'Task', {
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: { cpuArchitecture: CpuArchitecture.X86_64 },
    });

    taskDefinition.addContainer('Main', {
      image: ecs.ContainerImage.fromRegistry(`langgenius/dify-api:${props.imageTag}`),
      environment: {
        MODE: 'worker',
        // The log level for the application. Supported values are `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
        LOG_LEVEL: debug ? 'DEBUG' : 'ERROR',
        // enable DEBUG mode to output more logs
        DEBUG: debug ? 'true' : 'false',

        // When enabled, migrations will be executed prior to application startup and the application will start after the migrations have completed.
        MIGRATION_ENABLED: 'true',

        // The configurations of redis connection.
        REDIS_HOST: redis.endpoint,
        REDIS_PORT: redis.port.toString(),
        REDIS_USE_SSL: 'true',
        REDIS_DB: '0',

        // The S3 storage configurations, only available when STORAGE_TYPE is `s3`.
        STORAGE_TYPE: 's3',
        S3_BUCKET_NAME: storageBucket.bucketName,
        S3_REGION: Stack.of(storageBucket).region,

        DB_DATABASE: postgres.databaseName,
        // pgvector configurations
        VECTOR_STORE: 'pgvector',
        PGVECTOR_DATABASE: postgres.pgVectorDatabaseName,
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'log',
      }),
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(postgres.secret, 'username'),
        DB_HOST: ecs.Secret.fromSecretsManager(postgres.secret, 'host'),
        DB_PORT: ecs.Secret.fromSecretsManager(postgres.secret, 'port'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(postgres.secret, 'password'),
        PGVECTOR_USER: ecs.Secret.fromSecretsManager(postgres.secret, 'username'),
        PGVECTOR_HOST: ecs.Secret.fromSecretsManager(postgres.secret, 'host'),
        PGVECTOR_PORT: ecs.Secret.fromSecretsManager(postgres.secret, 'port'),
        PGVECTOR_PASSWORD: ecs.Secret.fromSecretsManager(postgres.secret, 'password'),
        REDIS_PASSWORD: ecs.Secret.fromSecretsManager(redis.secret),
        CELERY_BROKER_URL: ecs.Secret.fromSsmParameter(redis.brokerUrl),
        SECRET_KEY: ecs.Secret.fromSecretsManager(props.encryptionSecret),
      },
    });
    storageBucket.grantReadWrite(taskDefinition.taskRole);

    taskDefinition.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      })
    );

    const service = new ecs.FargateService(this, 'FargateService', {
      cluster,
      taskDefinition,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 0,
        },
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
        },
      ],
      enableExecuteCommand: true,
    });

    service.connections.allowToDefaultPort(postgres);
    service.connections.allowToDefaultPort(redis);
  }
}
