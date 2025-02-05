import { Construct } from 'constructs';
import { aws_ecs as ecs } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { DifyContainerTypes, EnvironmentProps } from '../../environment-props';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

export const getAdditionalEnvironmentVariables = (
  _: Construct,
  containerType: DifyContainerTypes,
  variables: EnvironmentProps['additionalEnvironmentVariables'],
) => {
  if (variables == null) {
    return {};
  }
  const result: { [key: string]: string } = {};

  for (const variable of variables) {
    if (variable.targets != null && !variable.targets.includes(containerType)) {
      continue;
    }
    if (typeof variable.value == 'string') {
      result[variable.key] = variable.value;
    }
  }
  return result;
};

export const getAdditionalSecretVariables = (
  scope: Construct,
  containerType: DifyContainerTypes,
  variables: EnvironmentProps['additionalEnvironmentVariables'],
) => {
  if (variables == null) {
    return {};
  }
  const result: { [key: string]: ecs.Secret } = {};

  for (const variable of variables) {
    if (variable.targets != null && !variable.targets.includes(containerType)) {
      continue;
    }
    if (typeof variable.value == 'string') {
      continue;
    }
    if ('parameterName' in variable.value) {
      const { parameterName } = variable.value;
      const parameter = StringParameter.fromStringParameterAttributes(
        scope,
        `Parameter-${containerType}-${parameterName}`,
        { parameterName, forceDynamicReference: true },
      );
      result[variable.key] = ecs.Secret.fromSsmParameter(parameter);
    }
    if ('secretName' in variable.value) {
      const { secretName, field } = variable.value;
      const secret = Secret.fromSecretNameV2(scope, `Secret-${containerType}-${secretName}`, secretName);
      result[variable.key] = ecs.Secret.fromSecretsManager(secret, field);
    }
  }
  return result;
};
