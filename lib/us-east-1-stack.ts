import * as cdk from 'aws-cdk-lib';
import { Certificate, CertificateValidation, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { CommonWebAcl } from './constructs/web-acl';

interface UsEast1StackProps extends cdk.StackProps {
  domainName?: string;
  allowedIpV4AddressRanges?: string[];
  allowedIpV6AddressRanges?: string[];
  allowedCountryCodes?: string[];
}

export class UsEast1Stack extends cdk.Stack {
  public readonly certificate?: ICertificate;
  public readonly webAclArn?: string;

  constructor(scope: Construct, id: string, props: UsEast1StackProps) {
    super(scope, id, props);

    if (props.domainName) {
      const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
        domainName: props.domainName,
      });

      const cert = new Certificate(this, 'Certificate', {
        domainName: `*.${hostedZone.zoneName}`,
        validation: CertificateValidation.fromDns(hostedZone),
        subjectAlternativeNames: [hostedZone.zoneName],
      });

      this.certificate = cert;
    }

    if (props.allowedIpV4AddressRanges || props.allowedIpV6AddressRanges || props.allowedCountryCodes) {
      const webAcl = new CommonWebAcl(this, 'WebAcl', {
        scope: 'CLOUDFRONT',
        allowedIpV4AddressRanges: props.allowedIpV4AddressRanges,
        allowedIpV6AddressRanges: props.allowedIpV6AddressRanges,
        allowedCountryCodes: props.allowedCountryCodes,
      });

      this.webAclArn = webAcl.webAclArn;
    }
  }
}
