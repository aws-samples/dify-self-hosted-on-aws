import {
  GatewayVpcEndpoint,
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
  IVpc,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcEndpointsProps {
  vpc: IVpc;
}

export class VpcEndpoints extends Construct {
  constructor(scope: Construct, id: string, props: VpcEndpointsProps) {
    super(scope, id);

    const { vpc } = props;
    const serviceList: { service: InterfaceVpcEndpointAwsService }[] = [
      // for ECS Fargate
      {
        service: InterfaceVpcEndpointAwsService.ECR,
      },
      {
        service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
      },
      {
        service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      },
      {
        service: InterfaceVpcEndpointAwsService.SSM,
      },
      {
        service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      },
      // for Dify app
      {
        service: InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      },
      {
        service: InterfaceVpcEndpointAwsService.BEDROCK_AGENT_RUNTIME,
      },
      // for debugging
      {
        service: InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      },
    ];

    serviceList.forEach((item) => {
      new InterfaceVpcEndpoint(this, item.service.shortName, {
        vpc,
        service: item.service,
      });
    });

    // for ECS Fargate and Dify app
    new GatewayVpcEndpoint(this, 'S3', {
      vpc,
      service: GatewayVpcEndpointAwsService.S3,
    });
  }
}
