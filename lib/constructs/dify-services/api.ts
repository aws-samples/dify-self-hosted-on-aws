import { CpuArchitecture, FargateTaskDefinition, ICluster } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { Duration, Stack, aws_ecs as ecs } from 'aws-cdk-lib';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Postgres } from '../postgres';
import { Redis } from '../redis';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { join } from 'path';
import { Alb } from '../alb';

export interface ApiServiceProps {
  cluster: ICluster;
  alb: Alb;

  postgres: Postgres;
  redis: Redis;
  storageBucket: IBucket;

  imageTag: string;
  sandboxImageTag: string;
  allowAnySyscalls: boolean;

  /**
   * If true, enable debug outputs
   * @default false
   */
  debug?: boolean;
}

export class ApiService extends Construct {
  public readonly encryptionSecret: Secret;

  constructor(scope: Construct, id: string, props: ApiServiceProps) {
    super(scope, id);

    const { cluster, alb, postgres, redis, storageBucket, debug = false } = props;
    const port = 5001;

    const taskDefinition = new FargateTaskDefinition(this, 'Task', {
      cpu: 1024,
      // 512だとOOMが起きたので、増やした
      memoryLimitMiB: 2048,
      runtimePlatform: { cpuArchitecture: CpuArchitecture.X86_64 },
    });

    const encryptionSecret = new Secret(this, 'EncryptionSecret', {
      generateSecretString: {
        passwordLength: 42,
      },
    });
    this.encryptionSecret = encryptionSecret;

    taskDefinition.addContainer('Main', {
      image: ecs.ContainerImage.fromRegistry(`langgenius/dify-api:${props.imageTag}`),
      // https://docs.dify.ai/getting-started/install-self-hosted/environments
      environment: {
        MODE: 'api',
        // The log level for the application. Supported values are `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
        LOG_LEVEL: debug ? 'DEBUG' : 'ERROR',
        // enable DEBUG mode to output more logs
        DEBUG: debug ? 'true' : 'false',

        // The base URL of console application web frontend, refers to the Console base URL of WEB service if console domain is
        // different from api or web app domain.
        CONSOLE_WEB_URL: alb.url,
        // The base URL of console application api server, refers to the Console base URL of WEB service if console domain is different from api or web app domain.
        CONSOLE_API_URL: alb.url,
        // The URL prefix for Service API endpoints, refers to the base URL of the current API service if api domain is different from console domain.
        SERVICE_API_URL: alb.url,
        // The URL prefix for Web APP frontend, refers to the Web App base URL of WEB service if web app domain is different from console or api domain.
        APP_WEB_URL: alb.url,

        // The configurations of redis connection.
        REDIS_HOST: redis.endpoint,
        REDIS_PORT: redis.port.toString(),
        REDIS_USE_SSL: 'true',
        REDIS_DB: '0',

        // Specifies the allowed origins for cross-origin requests to the Web API, e.g. https://dify.app or * for all origins.
        WEB_API_CORS_ALLOW_ORIGINS: '*',
        // Specifies the allowed origins for cross-origin requests to the console API, e.g. https://cloud.dify.ai or * for all origins.
        CONSOLE_CORS_ALLOW_ORIGINS: '*',

        // The type of storage to use for storing user files.
        STORAGE_TYPE: 's3',
        S3_BUCKET_NAME: storageBucket.bucketName,
        S3_REGION: Stack.of(storageBucket).region,

        // postgres settings. the credentials are in secrets property.
        DB_DATABASE: postgres.databaseName,

        // pgvector configurations
        VECTOR_STORE: 'pgvector',
        PGVECTOR_DATABASE: postgres.pgVectorDatabaseName,

        // The sandbox service endpoint.
        CODE_EXECUTION_ENDPOINT: 'http://localhost:8194', // Fargate の task 内通信は localhost 宛,
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'log',
      }),
      portMappings: [{ containerPort: port }],
      secrets: {
        // The configurations of postgres database connection.
        // It is consistent with the configuration in the 'db' service below.
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
        SECRET_KEY: ecs.Secret.fromSecretsManager(encryptionSecret),
        CODE_EXECUTION_API_KEY: ecs.Secret.fromSecretsManager(encryptionSecret), // is it ok to reuse this?
      },
      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${port}/health || exit 1`],
        interval: Duration.seconds(15),
        startPeriod: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 5,
      },
    });

    taskDefinition.addContainer('Sandbox', {
      image: ecs.ContainerImage.fromAsset(join(__dirname, 'docker'), {
        file: 'sandbox.Dockerfile',
        platform: Platform.LINUX_AMD64,
        buildArgs: {
          DIFY_VERSION: props.sandboxImageTag,
        },
      }),
      environment: {
        GIN_MODE: 'release',
        WORKER_TIMEOUT: '15',
        ENABLE_NETWORK: 'true',
        ...(props.allowAnySyscalls
          ? {
              ALLOWED_SYSCALLS: Array(457)
                .fill(0)
                .map((_, i) => i)
                .join(','),
            }
          : {}),
        PYTHON_LIB_PATH: [
          // Originally from here:
          // https://github.com/langgenius/dify-sandbox/blob/main/internal/static/config_default_amd64.go
          '/usr/local/lib/python3.10',
          '/usr/lib/python3.10',
          '/usr/lib/python3',
          // copy all the lib. **DO NOT** add a trailing slash!
          '/usr/lib/x86_64-linux-gnu',
          '/etc/ssl/certs/ca-certificates.crt',
          '/etc/nsswitch.conf',
          '/etc/hosts',
          '/etc/resolv.conf',
          '/run/systemd/resolve/stub-resolv.conf',
          '/run/resolvconf/resolv.conf',
        ].join(','),
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'log',
      }),
      portMappings: [{ containerPort: 8194 }],
      secrets: {
        API_KEY: ecs.Secret.fromSecretsManager(encryptionSecret),
      },
    });

    storageBucket.grantReadWrite(taskDefinition.taskRole);

    // we can use IAM role once this issue will be closed
    // https://github.com/langgenius/dify/issues/3471
    taskDefinition.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      }),
    );

    // Service
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

    const paths = ['/console/api', '/api', '/v1', '/files'];
    alb.addEcsService('Api', service, port, '/health', [...paths, ...paths.map((p) => `${p}/*`)]);
  }
}
