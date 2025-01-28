/**
 * The configuration parameters for a Dify environment
 */
export interface EnvironmentProps {
  /**
   * The AWS region where you want to deploy this system.
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
   * Ignored when you import an existing VPC.
   * @default false
   */
  cheapVpc?: boolean;

  /**
   * If set, it imports the existing VPC instead of creating a new one.
   * The VPC must have one or more public and private subnets.
   * @default create a new VPC
   */
  vpcId?: string;

  /**
   * The domain name you use for Dify's service URL.
   * You must own a Route53 public hosted zone for the domain in your account.
   * @default No custom domain is used.
   */
  domainName?: string;

  /**
   * If true, the ElastiCache Redis cluster is deployed to multiple AZs for fault tolerance.
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
   * The image tag to deploy Dify container images (api=worker and web).
   * The images are pulled from [here](https://hub.docker.com/u/langgenius).
   *
   * It is recommended to set this to a fixed version,
   * because otherwise an unexpected version is pulled on a ECS service's scaling activity.
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
   * If true, Dify sandbox allows any system calls when executing code.
   * Do NOT set this property if you are not sure code executed in the sandbox
   * can be trusted or not.
   *
   * @default false
   */
  allowAnySyscalls?: boolean;

  /**
   * Deploy CloudFront in front of ALB.
   * Recommended to enable it if you do not own domain.
   *
   * @default true
   */
  useCloudFront?: boolean;
}
