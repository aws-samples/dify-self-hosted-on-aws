/**
 * The configuration parameters for a Dify environment
 */
export interface EnvironmentProps {
  /**
   * The AWS region where you want to deploy this system.
   * @example 'us-east-1'
   */
  awsRegion: string;

  /**
   * You need to explicitly set AWS account ID when you look up an existing VPC or set a custom domain name.
   * @example '123456789012'
   */
  awsAccount: string;

  /**
   * IPv4 address ranges in CIDR notation that have access to the app.
   * @example ['1.1.1.1/30']
   * @default Allow access from any IP addresses
   */
  allowedIPv4Cidrs?: string[];

  /**
   * IPv6 address ranges in CIDR notation that have access to the app.
   * @example ['2001:db8:0:7::5/64']
   * @default Allow access from any IP addresses
   */
  allowedIPv6Cidrs?: string[];

  /**
   * Use t4g.nano NAT instances instead of NAT Gateway.
   * This property is ignored when you import an existing VPC (see {@link vpcId}.)
   * @default false
   */
  useNatInstance?: boolean;

  /**
   * If true, it creates a VPC with only isolated subnets (i.e. without Internet gateway nor NAT Gateways.)
   * This property is ignored when you import an existing VPC (see {@link vpcId}.)
   * @default false
   */
  vpcIsolated?: boolean;

  /**
   * If set, it imports the existing VPC instead of creating a new one.
   * The VPC must have one or more public and private subnets.
   * @default create a new VPC
   */
  vpcId?: string;

  /**
   * The domain name you use for Dify's service URL.
   * You must own a Route53 public hosted zone for the domain in your account.
   * This will enable TLS encryption of ALB when {@link useCloudFront} is false.
   * @default No custom domain is used.
   */
  domainName?: string;

  /**
   * Your Dify app will be accessible with `https://<subDomain>.<domainName>`.
   * This property is ignored when {@link domainName} is not set.
   * @default 'dify'
   */
  subDomain?: string;

  /**
   * If true, the ElastiCache Valkey cluster is deployed to multiple AZs for fault tolerance.
   * It is generally recommended to enable this, but you can disable it to minimize AWS cost.
   * @default true
   */
  isRedisMultiAz?: boolean;

  /**
   * If enabled, Aurora Serverless v2 automatically scales to zero with cold start around 10 seconds.
   * https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html
   * @default false
   */
  enableAuroraScalesToZero?: boolean;

  /**
   * If enabled, Dify runs on Fargate spot capacity. Note that because Fargate spot can be interrupted,
   * it is recommended to use the option for non-critical use case.
   * @default false
   */
  useFargateSpot?: boolean;

  /**
   * The image tag to deploy the Dify container images (api and web).
   * The images are pulled from [here](https://hub.docker.com/u/langgenius).
   *
   * It is recommended to set this to a fixed version to prevent from accidental updates.
   * @default "latest"
   */
  difyImageTag?: string;

  /**
   * The image tag to deploy the Dify sandbox container image.
   * The image is pulled from [here](https://hub.docker.com/r/langgenius/dify-sandbox/tags).
   *
   * @default "latest"
   */
  difySandboxImageTag?: string;

  /**
   * The image tag to deploy the Dify plugin-daemon container image.
   * The image is pulled from [here](https://hub.docker.com/r/langgenius/dify-plugin-daemon/tags).
   *
   * @default "main-local"
   */
  difyPluginDaemonImageTag?: string;

  /**
   * If true, Dify sandbox allows any system calls when executing code.
   * Do NOT set this property if you are not sure code executed in the sandbox
   * can be trusted or not.
   *
   * @default false
   */
  allowAnySyscalls?: boolean;

  /**
   * Deploy CloudFront in front of ALB.
   * Recommended to enable it if you do not own any domain (see {@link domainName}.)
   *
   * @default true
   */
  useCloudFront?: boolean;

  /**
   * Deploy alb in private or isolated subnet and does not make accessible from the internet.
   * This property cannot be set when {@link useCloudFront} is true.
   *
   * @default false
   */
  internalAlb?: boolean;

  /**
   * If set, ECR tasks pull Dify container images from this ECR private repository instead of Docker Hub.
   * When you use this, you must run `copy-to-ecr.ts` before deployment to push Dify images to the private repository.
   * (See README.md for more details.)
   *
   * @default Images are pulled from Docker Hub.
   */
  customEcrRepositoryName?: string;

  /**
   *
   * @default No additional environment variables.
   */
  additionalEnvironmentVariables?: {
    key: string;
    value:
      | string
      | {
          /**
           * Use this when you want to refer to an existing Systems Manager parameter.
           */
          parameterName: string;
        }
      | {
          /**
           * Use this when you want to refer to an existing Secrets Manager secret.
           */
          secretName: string;
          /**
           * The name of the field with the value that you want to set as the environment variable value. Only values in JSON format are supported. If you do not specify a JSON field, then the full content of the secret is used.
           */
          field?: string;
        };
    /**
     * The list of targets that use this environment variable.
     * If not set, it is applied to all targets.
     */
    targets?: DifyContainerTypes[];
  }[];

  /**
   * If true, CDK configures SES and SMTP credentials using {@link domainName}.
   * @default false
   */
  setupEmail?: boolean;
}

export type DifyContainerTypes = 'web' | 'api' | 'worker' | 'sandbox';
