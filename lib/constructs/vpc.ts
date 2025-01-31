import { InstanceClass, InstanceSize, InstanceType, IVpc, NatProvider, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { VpcEndpoints } from './vpc-endpoints';

export const createVpc = (
  scope: Construct,
  props: { vpcId?: string; useNatInstance?: boolean; isolated?: boolean },
) => {
  const { useNatInstance = false, isolated = false } = props;

  let vpc: IVpc;
  if (props.vpcId != null) {
    vpc = Vpc.fromLookup(scope, 'Vpc', { vpcId: props.vpcId });
  } else if (isolated) {
    vpc = new Vpc(scope, 'Vpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          subnetType: SubnetType.PRIVATE_ISOLATED,
          name: 'Isolated',
        },
      ],
    });

    new VpcEndpoints(scope, 'VpcEndpoints', { vpc });
  } else {
    vpc = new Vpc(scope, 'Vpc', {
      ...(useNatInstance
        ? {
            natGatewayProvider: NatProvider.instanceV2({
              instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.NANO),
              associatePublicIpAddress: true,
            }),
            natGateways: 1,
          }
        : {}),
      maxAzs: 2,
      subnetConfiguration: [
        {
          subnetType: SubnetType.PUBLIC,
          name: 'Public',
          mapPublicIpOnLaunch: false,
        },
        {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          name: 'Private',
        },
      ],
    });
  }
  return vpc;
};
