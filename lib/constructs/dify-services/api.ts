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
import { IAlb } from '../alb';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import { getAdditionalEnvironmentVariables, getAdditionalSecretVariables } from './environment-variables';
import { EnvironmentProps } from '../../environment-props';
import { EmailService } from '../email';

export interface ApiServiceProps {
  cluster: ICluster;
  alb: IAlb;

  postgres: Postgres;
  redis: Redis;
  storageBucket: IBucket;
  email?: EmailService;

  imageTag: string;
  sandboxImageTag: string;
  pluginDaemonImageTag?: string;
  allowAnySyscalls: boolean;

  /**
   * If true, enable debug outputs
   * @default false
   */
  debug?: boolean;

  customRepository?: IRepository;

  additionalEnvironmentVariables: EnvironmentProps['additionalEnvironmentVariables'];

  useFargateSpot: boolean;
}

export class ApiService extends Construct {
  constructor(scope: Construct, id: string, props: ApiServiceProps) {
    super(scope, id);

    const {
      cluster,
      alb,
      postgres,
      redis,
      storageBucket,
      email,
      debug = false,
      customRepository,
      pluginDaemonImageTag = 'main-local',
    } = props;
    const port = 5001;
    const volumeName = 'sandbox';

    const taskDefinition = new FargateTaskDefinition(this, 'Task', {
      cpu: 1024,
      // 512だとOOMが起きたので、増やした
      memoryLimitMiB: 2048,
      runtimePlatform: { cpuArchitecture: CpuArchitecture.X86_64 },
      volumes: [
        {
          name: volumeName,
        },
      ],
    });

    const encryptionSecret = new Secret(this, 'EncryptionSecret', {
      generateSecretString: {
        passwordLength: 42,
      },
    });

    taskDefinition.addContainer('Main', {
      image: customRepository
        ? ecs.ContainerImage.fromEcrRepository(customRepository, `dify-api_${props.imageTag}`)
        : ecs.ContainerImage.fromRegistry(`langgenius/dify-api:${props.imageTag}`),
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

        // Enable pessimistic disconnect handling for recover from Aurora automatic pause
        // https://docs.sqlalchemy.org/en/20/core/pooling.html#disconnect-handling-pessimistic
        SQLALCHEMY_POOL_PRE_PING: 'True',

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
        S3_USE_AWS_MANAGED_IAM: 'true',

        // postgres settings. the credentials are in secrets property.
        DB_DATABASE: postgres.databaseName,

        // pgvector configurations
        VECTOR_STORE: 'pgvector',
        PGVECTOR_DATABASE: postgres.pgVectorDatabaseName,

        // The sandbox service endpoint.
        CODE_EXECUTION_ENDPOINT: 'http://localhost:8194', // Fargate の task 内通信は localhost 宛,

        ...(email
          ? {
              MAIL_TYPE: 'smtp',
              SMTP_SERVER: email.serverAddress,
              SMTP_PORT: email.serverPort,
              SMTP_USE_TLS: 'true',
              MAIL_DEFAULT_SEND_FROM: `no-reply@${email.domainName}`,
            }
          : {}),

        ...getAdditionalEnvironmentVariables(this, 'api', props.additionalEnvironmentVariables),
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
        ...(email
          ? {
              SMTP_USERNAME: ecs.Secret.fromSecretsManager(email.smtpCredentials, 'username'),
              SMTP_PASSWORD: ecs.Secret.fromSecretsManager(email.smtpCredentials, 'password'),
            }
          : {}),

        ...getAdditionalSecretVariables(this, 'api', props.additionalEnvironmentVariables),
      },
      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${port}/health || exit 1`],
        interval: Duration.seconds(15),
        startPeriod: Duration.seconds(90),
        timeout: Duration.seconds(5),
        retries: 10,
      },
    });

    taskDefinition.addContainer('Worker', {
      image: customRepository
        ? ecs.ContainerImage.fromEcrRepository(customRepository, `dify-api_${props.imageTag}`)
        : ecs.ContainerImage.fromRegistry(`langgenius/dify-api:${props.imageTag}`),
      environment: {
        MODE: 'worker',
        // The log level for the application. Supported values are `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
        LOG_LEVEL: debug ? 'DEBUG' : 'ERROR',
        // enable DEBUG mode to output more logs
        DEBUG: debug ? 'true' : 'false',

        CONSOLE_WEB_URL: alb.url,
        CONSOLE_API_URL: alb.url,
        SERVICE_API_URL: alb.url,
        APP_WEB_URL: alb.url,

        // When enabled, migrations will be executed prior to application startup and the application will start after the migrations have completed.
        MIGRATION_ENABLED: 'true',

        // Enable pessimistic disconnect handling for recover from Aurora automatic pause
        SQLALCHEMY_POOL_PRE_PING: 'True',

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

        ...(email
          ? {
              MAIL_TYPE: 'smtp',
              SMTP_SERVER: email.serverAddress,
              SMTP_PORT: email.serverPort,
              SMTP_USE_TLS: 'true',
              MAIL_DEFAULT_SEND_FROM: `no-reply@${email.domainName}`,
            }
          : {}),

        ...getAdditionalEnvironmentVariables(this, 'worker', props.additionalEnvironmentVariables),
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
        SECRET_KEY: ecs.Secret.fromSecretsManager(encryptionSecret),
        ...(email
          ? {
              SMTP_USERNAME: ecs.Secret.fromSecretsManager(email.smtpCredentials, 'username'),
              SMTP_PASSWORD: ecs.Secret.fromSecretsManager(email.smtpCredentials, 'password'),
            }
          : {}),

        ...getAdditionalSecretVariables(this, 'worker', props.additionalEnvironmentVariables),
      },
    });

    const sandboxFileContainer = taskDefinition.addContainer('SandboxFileMount', {
      image: ecs.ContainerImage.fromAsset(join(__dirname, 'docker', 'sandbox'), {
        platform: Platform.LINUX_AMD64,
        buildArgs: {
          DISABLE_PYTHON_DEPENDENCIES: 'false',
        },
      }),
      essential: false,
    });

    const sandboxContainer = taskDefinition.addContainer('Sandbox', {
      image: customRepository
        ? ecs.ContainerImage.fromEcrRepository(customRepository, `dify-sandbox_${props.sandboxImageTag}`)
        : ecs.ContainerImage.fromRegistry(`langgenius/dify-sandbox:${props.sandboxImageTag}`),
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

        ...getAdditionalEnvironmentVariables(this, 'sandbox', props.additionalEnvironmentVariables),
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'log',
      }),
      portMappings: [{ containerPort: 8194 }],
      secrets: {
        API_KEY: ecs.Secret.fromSecretsManager(encryptionSecret),
        ...getAdditionalSecretVariables(this, 'sandbox', props.additionalEnvironmentVariables),
      },
    });

    sandboxFileContainer.addMountPoints({
      containerPath: '/dependencies',
      sourceVolume: volumeName,
      readOnly: false,
    });
    sandboxContainer.addMountPoints({
      containerPath: '/dependencies',
      sourceVolume: volumeName,
      readOnly: true,
    });
    sandboxContainer.addContainerDependencies({
      container: sandboxFileContainer,
      condition: ecs.ContainerDependencyCondition.COMPLETE,
    });

    taskDefinition.addContainer('ExternalKnowledgeBaseAPI', {
      image: ecs.ContainerImage.fromAsset(join(__dirname, 'docker', 'external-knowledge-api'), {
        platform: Platform.LINUX_AMD64,
        buildArgs: {
          DIFY_VERSION: props.sandboxImageTag,
        },
      }),
      environment: {
        BEARER_TOKEN: 'dummy-key',
        BEDROCK_REGION: 'us-west-2',
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'log',
      }),
      portMappings: [{ containerPort: 8000 }],
    });

    // Add plugin-daemon container
    taskDefinition.addContainer('PluginDaemon', {
      image: customRepository
        ? ecs.ContainerImage.fromEcrRepository(customRepository, `dify-plugin-daemon_${pluginDaemonImageTag}`)
        : ecs.ContainerImage.fromRegistry(`langgenius/dify-plugin-daemon:${pluginDaemonImageTag}`),
      environment: {
        DIFY_INNER_API_URL: `http://localhost:${port}`,
        PLUGIN_WORKING_PATH: '/app/storage/cwd',
        FORCE_VERIFYING_SIGNATURE: 'true',
        S3_USE_AWS_MANAGED_IAM: 'true',
        S3_ENDPOINT: `https://s3.${Stack.of(this).region}.amazonaws.com`,
        S3_BUCKET_NAME: storageBucket.bucketName,
        S3_REGION: Stack.of(storageBucket).region,

        ...getAdditionalEnvironmentVariables(this, 'api', props.additionalEnvironmentVariables),
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'log',
      }),
      secrets: {
        API_KEY: ecs.Secret.fromSecretsManager(encryptionSecret),
        // プラグインデーモンは追加シークレット変数をアクセスしない
      },
    });
    storageBucket.grantReadWrite(taskDefinition.taskRole);

    // we can use IAM role once this issue will be closed
    // https://github.com/langgenius/dify/issues/3471
    taskDefinition.taskRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:Rerank',
          'bedrock:Retrieve',
          'bedrock:RetrieveAndGenerate',
        ],
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
          weight: props.useFargateSpot ? 0 : 1,
        },
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: props.useFargateSpot ? 1 : 0,
        },
      ],
      enableExecuteCommand: true,
      minHealthyPercent: 100,
    });

    postgres.connections.allowDefaultPortFrom(service);
    redis.connections.allowDefaultPortFrom(service);

    const paths = ['/console/api', '/api', '/v1', '/files'];
    alb.addEcsService('Api', service, port, '/health', [...paths, ...paths.map((p) => `${p}/*`)]);
  }
}
