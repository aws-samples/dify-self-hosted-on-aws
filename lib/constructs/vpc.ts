import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  NatProvider,
  NatTrafficDirection,
  Peer,
  Port,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
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
    const natProvider = useNatInstance
      ? NatProvider.instanceV2({
          instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.NANO),
          associatePublicIpAddress: true,
          defaultAllowedTraffic: NatTrafficDirection.OUTBOUND_ONLY,
        })
      : undefined;

    vpc = new Vpc(scope, 'Vpc', {
      ...(natProvider
        ? {
            natGatewayProvider: natProvider,
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

    // Restrict inbound traffic to the VPC instead of allowing any IPv4 source.
    natProvider?.connections.allowFrom(Peer.ipv4(vpc.vpcCidrBlock), Port.allTraffic());
  }
  return vpc;
};
