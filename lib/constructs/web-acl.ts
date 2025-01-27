import { CfnIPSet, CfnWebACL, CfnWebACLProps } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

// code is referenced and modified from here:
// https://github.com/aws-samples/generative-ai-use-cases-jp/blob/main/packages/cdk/lib/construct/common-web-acl.ts

export interface CommonWebAclProps {
  scope: 'REGIONAL' | 'CLOUDFRONT';
  allowedIpV4AddressRanges?: string[] | null;
  allowedIpV6AddressRanges?: string[] | null;
  allowedCountryCodes?: string[] | null;
}

export class CommonWebAcl extends Construct {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: CommonWebAclProps) {
    super(scope, id);

    const rules: CfnWebACLProps['rules'] = [];

    const commonRuleProperties = (
      name: string,
    ): Pick<CfnWebACL.RuleProperty, 'name' | 'action' | 'visibilityConfig'> => ({
      name,
      action: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: name,
      },
    });

    const generateIpSetRule = (priority: number, name: string, ipSetArn: string): CfnWebACL.RuleProperty => ({
      priority,
      ...commonRuleProperties(name),
      statement: {
        ipSetReferenceStatement: {
          arn: ipSetArn,
        },
      },
    });

    const generateIpSetAndGeoMatchRule = (
      priority: number,
      name: string,
      ipSetArn: string,
      allowedCountryCodes: string[],
    ): CfnWebACL.RuleProperty => ({
      priority,
      ...commonRuleProperties(name),
      statement: {
        // ルール間の条件はOR判定になるので、同一ルール内でAND条件で指定する
        andStatement: {
          statements: [
            {
              ipSetReferenceStatement: {
                arn: ipSetArn,
              },
            },
            {
              geoMatchStatement: {
                countryCodes: allowedCountryCodes,
              },
            },
          ],
        },
      },
    });

    const hasAllowedIpV4 = props.allowedIpV4AddressRanges && props.allowedIpV4AddressRanges.length > 0;
    const hasAllowedIpV6 = props.allowedIpV6AddressRanges && props.allowedIpV6AddressRanges.length > 0;
    const hasAllowedCountryCodes = props.allowedCountryCodes && props.allowedCountryCodes.length > 0;

    // IP v4 と v6 それぞれでルールを定義する
    if (hasAllowedIpV4) {
      const wafIPv4Set = new CfnIPSet(this, 'IPv4Set', {
        ipAddressVersion: 'IPV4',
        scope: props.scope,
        addresses: props.allowedIpV4AddressRanges ?? [],
      });
      if (hasAllowedCountryCodes) {
        // Geo制限を行う場合は、IP制限とのAND条件にする
        rules.push(
          generateIpSetAndGeoMatchRule(
            1,
            'IpV4SetAndGeoMatchRule',
            wafIPv4Set.attrArn,
            props.allowedCountryCodes ?? [],
          ),
        );
      } else {
        rules.push(generateIpSetRule(1, 'IpV4SetRule', wafIPv4Set.attrArn));
      }
    }

    if (hasAllowedIpV6) {
      const wafIPv6Set = new CfnIPSet(this, 'IPv6Set', {
        ipAddressVersion: 'IPV6',
        scope: props.scope,
        addresses: props.allowedIpV6AddressRanges ?? [],
      });
      if (hasAllowedCountryCodes) {
        // Geo制限を行う場合は、IP制限とのAND条件にする
        rules.push(
          generateIpSetAndGeoMatchRule(
            2,
            'IpV6SetAndGeoMatchRule',
            wafIPv6Set.attrArn,
            props.allowedCountryCodes ?? [],
          ),
        );
      } else {
        rules.push(generateIpSetRule(2, 'IpV6SetRule', wafIPv6Set.attrArn));
      }
    }

    // IP制限なしのGe制限のみの場合は、Geo制限のルールを定義
    if (!hasAllowedIpV4 && !hasAllowedIpV6 && hasAllowedCountryCodes) {
      rules.push({
        priority: 3,
        ...commonRuleProperties('GeoMatchRule'),
        statement: {
          geoMatchStatement: {
            countryCodes: props.allowedCountryCodes ?? [],
          },
        },
      });
    }

    const webAcl = new CfnWebACL(this, 'WebAcl', {
      defaultAction: { block: {} },
      scope: props.scope,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: `DifyWebAcl-${this.node.addr}`,
      },
      rules: rules,
    });
    this.webAclArn = webAcl.attrArn;
  }
}
