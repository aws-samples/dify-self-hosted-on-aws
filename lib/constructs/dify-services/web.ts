import { CpuArchitecture, FargateTaskDefinition, ICluster } from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { Duration, aws_ecs as ecs } from 'aws-cdk-lib';
import { IAlb } from '../alb';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import { EnvironmentProps } from '../../environment-props';
import { getAdditionalEnvironmentVariables, getAdditionalSecretVariables } from './environment-variables';

export interface WebServiceProps {
  cluster: ICluster;
  alb: IAlb;

  imageTag: string;

  /**
   * If true, enable debug outputs
   * @default false
   */
  debug?: boolean;
  customRepository?: IRepository;

  additionalEnvironmentVariables: EnvironmentProps['additionalEnvironmentVariables'];
}

export class WebService extends Construct {
  constructor(scope: Construct, id: string, props: WebServiceProps) {
    super(scope, id);

    const { cluster, alb, debug = false, customRepository } = props;
    const port = 3000;

    const taskDefinition = new FargateTaskDefinition(this, 'Task', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: { cpuArchitecture: CpuArchitecture.X86_64 },
    });

    taskDefinition.addContainer('Main', {
      image: customRepository
        ? ecs.ContainerImage.fromEcrRepository(customRepository, `dify-web_${props.imageTag}`)
        : ecs.ContainerImage.fromRegistry(`langgenius/dify-web:${props.imageTag}`),
      environment: {
        // The log level for the application. Supported values are `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
        LOG_LEVEL: debug ? 'DEBUG' : 'ERROR',
        // enable DEBUG mode to output more logs
        DEBUG: debug ? 'true' : 'false',

        // The base URL of console application api server, refers to the Console base URL of WEB service if console domain is different from api or web app domain.
        // example: http://cloud.dify.ai
        CONSOLE_API_URL: alb.url,
        // The URL prefix for Web APP frontend, refers to the Web App base URL of WEB service if web app domain is different from console or api domain.
        // example: http://udify.app
        APP_API_URL: alb.url,

        // Setting host to 0.0.0.0 seems necessary for health check to pass.
        // https://nextjs.org/docs/pages/api-reference/next-config-js/output
        HOSTNAME: '0.0.0.0',
        PORT: port.toString(),

        ...getAdditionalEnvironmentVariables(this, 'web', props.additionalEnvironmentVariables),
      },
      secrets: {
        ...getAdditionalSecretVariables(this, 'web', props.additionalEnvironmentVariables),
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'log',
      }),
      portMappings: [{ containerPort: port }],
      healthCheck: {
        // use wget instead of curl due to alpine: https://stackoverflow.com/a/47722899/18550269
        command: ['CMD-SHELL', `wget --no-verbose --tries=1 --spider http://localhost:${port}/ || exit 1`],
        interval: Duration.seconds(15),
        startPeriod: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
      },
    });

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
      minHealthyPercent: 100,
    });

    alb.addEcsService('Web', service, port, '/', ['/*']);
  }
}
