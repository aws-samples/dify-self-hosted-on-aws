import { Duration, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { User } from 'aws-cdk-lib/aws-iam';
import { SesSmtpCredentials } from '@pepperize/cdk-ses-smtp-credentials';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { IHostedZone, TxtRecord } from 'aws-cdk-lib/aws-route53';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';

export interface EmailServiceProps {
  hostedZone: IHostedZone;
  setupSes?: boolean;
}

export class EmailService extends Construct {
  /**
   * contains json value {username: "the generated access key id", password: "the calculated ses smtp password"}
   */
  public readonly smtpCredentials: ISecret;
  public readonly serverAddress: string;
  public readonly serverPort: string;
  public readonly domainName: string;

  constructor(scope: Construct, id: string, props: EmailServiceProps) {
    super(scope, id);

    const { hostedZone, setupSes = true } = props;
    const domainName = hostedZone.zoneName;

    if (setupSes) {
      new EmailIdentity(this, 'Identity', {
        identity: Identity.publicHostedZone(hostedZone),
        mailFromDomain: `bounce.${domainName}`,
      });

      new TxtRecord(this, 'DmarcRecord', {
        zone: hostedZone,
        recordName: `_dmarc.${domainName}`,
        values: [`v=DMARC1; p=none; rua=mailto:dmarcreports@${domainName}`],
        ttl: Duration.hours(1),
      });
    }

    const smtpCredentials = new SesSmtpCredentials(this, 'SmtpCredentials', {});

    this.smtpCredentials = smtpCredentials.secret;
    this.serverAddress = `email-smtp.${Stack.of(this).region}.amazonaws.com`;
    // dify seems to support tls wrapper only
    // https://docs.aws.amazon.com/ses/latest/dg/smtp-connect.html
    this.serverPort = '465';
    this.domainName = domainName;
  }
}
