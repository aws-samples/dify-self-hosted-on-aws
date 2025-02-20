import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VectorDatabaseProps extends cdk.StackProps {
  /**
   * Flag to enable OpenSearch Serverless
   * @default false
   */
  useOpenSearchServerless?: boolean;

  /**
   * Custom name for OpenSearch Serverless domain
   * @default 'dify-vector-db'
   */
  openSearchDomainName?: string;

  /**
   * VPC for the vector database
   */
  vpc: ec2.Vpc;
}

export class VectorDatabaseConstruct extends Construct {
  public readonly vectorDatabase: opensearch.CfnDomain | undefined;

  constructor(scope: Construct, id: string, props: VectorDatabaseProps) {
    super(scope, id);

    if (props.useOpenSearchServerless) {
      // OpenSearch Serverless設定
      this.vectorDatabase = new opensearch.CfnDomain(this, 'OpenSearchServerlessDomain', {
        domainName: props.openSearchDomainName || 'dify-vector-db',
        engineVersion: '2.11',
        clusterConfig: {
          // Serverless用の適切な設定
          dedicatedMasterEnabled: false,
          instanceCount: 1,
          instanceType: 'LATEST',
        },
        ebsOptions: {
          ebsEnabled: true,
          volumeSize: 10, // GB
          volumeType: 'gp2',
        },
        accessPolicies: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                AWS: '*', // 必要に応じて制限
              },
              Action: 'es:*',
              Resource: '*',
            },
          ],
        }),
        vpcOptions: {
          subnetIds: props.vpc.selectSubnets({ 
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS 
          }).subnetIds,
          securityGroupIds: [],
        },
      });
    }
  }
}
