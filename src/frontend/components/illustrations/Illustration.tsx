import heroUniversity from './hero-university.svg?raw';
import heroHotel from './hero-hotel.svg?raw';
import heroHospital from './hero-hospital.svg?raw';
import heroCompany from './hero-company.svg?raw';
import claimAnonymity from './claim-anonymity.svg?raw';
import claimGrants from './claim-grants.svg?raw';

const SOURCES = {
  'hero-university': heroUniversity,
  'hero-hotel': heroHotel,
  'hero-hospital': heroHospital,
  'hero-company': heroCompany,
  'claim-anonymity': claimAnonymity,
  'claim-grants': claimGrants,
} satisfies Record<string, string>;

export type IllustrationName = keyof typeof SOURCES;

export function Illustration({
  name,
  className,
  label,
}: {
  name: IllustrationName;
  className?: string;
  label?: string;
}): JSX.Element {
  return (
    <div
      className={className ? `illus ${className}` : 'illus'}
      dangerouslySetInnerHTML={{ __html: SOURCES[name] }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
