import { IConnectable } from 'aws-cdk-lib/aws-ec2';
import { FargateService } from 'aws-cdk-lib/aws-ecs';

export interface IEndpoint {
  readonly url: string;
  readonly alb: IAlb;
}
export interface IAlb extends IConnectable {
  readonly url: string;
  addEcsService(id: string, ecsService: FargateService, port: number, healthCheckPath: string, paths: string[]): void;
}
