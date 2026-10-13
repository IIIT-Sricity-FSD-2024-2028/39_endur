import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { CampaignAccess, CampaignStatus } from '@endur/shared';
import { Icon } from '../Icon.js';
import { formatDateTime } from '../../lib/format.js';
import { useLabels } from '../../lib/labels.js';
import { useAppSelector } from '../../store/index.js';

const SHARE_STATUS: Record<CampaignStatus, { label: string; tag: string }> = {
  open: { label: 'Collecting', tag: 'tag-good' },
  draft: { label: 'Collecting', tag: 'tag-good' },
  scheduled: { label: 'Scheduled', tag: 'tag-neutral' },
  closed: { label: 'Closed', tag: 'tag-muted' },
};

// eslint-disable-next-line no-restricted-syntax -- scanability, not brand (N-037).
const DARK = '#17232e';
// eslint-disable-next-line no-restricted-syntax -- scanability, not brand (N-037).
const LIGHT = '#ffffff';
const QR_SIZE = 300;
const QUIET_ZONE = 4;

const COPIED_MS = 1500;

export function isUnscannable(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

export function ShareSheet({
  url,
  campaignName,
  status,
  endsAt,
  anonymous = true,
  access = 'public',
  onClose,
}: {
  url: string;
  campaignName: string;
  status: CampaignStatus;
  endsAt?: string | null | undefined;
  anonymous?: boolean | undefined;
  access?: CampaignAccess | undefined;
  onClose: () => void;
}): JSX.Element {
  const L = useLabels();
  const orgName = useAppSelector((state) => state.auth.org?.name ?? '');
  const [copied, setCopied] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (presenting) setPresenting(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, presenting]);

  const copy = (): void => {
    void navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => setFailed(true),
    );
  };

  const download = (): void => {
    void QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: QUIET_ZONE,
      width: 1024,
      color: { dark: DARK, light: LIGHT },
    }).then((data) => {
      const link = document.createElement('a');
      link.href = data;
      link.download = `${campaignName.replace(/[^\w -]+/g, '').trim() || 'campaign'}-qr.png`;
      link.click();
    });
  };

  if (presenting) {
    return (
      <div className="present" role="dialog" aria-modal="true" aria-label={`${campaignName} — code`}>
        <p className="present-name">{campaignName}</p>
        <Qr url={url} size={Math.round(QR_SIZE * 2)} className="present-qr" />
        <p className="present-url">{display(url)}</p>
        <button type="button" className="btn btn-secondary present-exit" onClick={() => setPresenting(false)}>
          Close
        </button>
      </div>
    );
  }

  const shareStatus = SHARE_STATUS[status];

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog share-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${campaignName}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="share-head">
          <div className="share-headings">
            <p className={`tag ${shareStatus.tag}`}>{shareStatus.label}</p>
            <h2 className="share-title">{campaignName}</h2>
          </div>
          <button type="button" className="btn btn-icon share-close" onClick={onClose}>
            <Icon name="close" size={20} label="Close" />
          </button>
        </header>

        <div className="share-body">
          <Qr url={url} size={QR_SIZE} className="share-qr" />

          {/* Selectable, and big. Somebody at the back types this. */}
          <p className="share-url">{display(url)}</p>

          {/* Deleted by accident in a design pass on 26 Aug and restored here: it was the
              only thing in the product that says a QR will not scan, and `isUnscannable()`
              was left sitting there with no caller. `OPEN-002` is still open, so this
              warning is not decoration — it is the whole mitigation. */}
          {isUnscannable(url) && (
            <p className="share-warn" role="alert">
              This address points at <strong>localhost</strong>, which on a phone means the
              phone. Nobody can scan this. Set <code>PUBLIC_BASE_URL</code> to an address the
              room can reach before the demo — see <code>OPEN-002</code>.
            </p>
          )}

          {failed && (
            <p className="field-error" role="alert">
              Copying was refused by the browser. The address above can be selected by hand.
            </p>
          )}
        </div>

        <footer className="share-foot">
          <div className="share-foot-meta">
            <p className="share-meta text-meta">
              {status === 'closed'
                ? 'Closed'
                : endsAt
                  ? `Open until ${formatDateTime(endsAt)}`
                  : 'Open until it is closed'}
              {anonymous && ' · anonymous'}
            </p>
            {/* The org's own noun. This line said "Respondents" until T-044 — the vocabulary
                audit's one frontend finding, and it survived four audits because "Respondent"
                is the DEFAULT label rather than an education word, so the banned-noun grep had
                nothing to match (22 §5).

                AND IT BECOMES FALSE ON A RESTRICTED CAMPAIGN, which is why `access` reaches
                this component at all (24 §6). Somebody scanning a restricted code and hitting
                a sign-in wall with no warning is a support ticket, and the person handing the
                link out is the only one who can prevent it — so the warning belongs here,
                where they are looking, and not only on the form. */}
            <p className="share-meta text-meta">
              {access === 'organization'
                ? `Only people in ${orgName || 'your organization'} can answer — they’ll be asked to sign in.`
                : `${L.respondent.many} don’t need an account.`}
            </p>
          </div>
          <div className="share-foot-actions">
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={download}>Download QR</button>
            <button type="button" className="btn btn-primary" onClick={() => setPresenting(true)}>Full</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

const display = (url: string): string => url.replace(/^https?:\/\//, '');

function Qr({ url, size, className }: { url: string; size: number; className?: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, url, {
      errorCorrectionLevel: 'M',
      margin: QUIET_ZONE,
      width: size,
      color: { dark: DARK, light: LIGHT },
    }).then(
      () => setError(false),
      () => setError(true),
    );
  }, [url, size]);

  return (
    <div className={className}>
      <canvas ref={ref} width={size} height={size} role="img" aria-label={`QR code for ${display(url)}`} />
      {error && (
        <p className="field-error" role="alert">
          The code could not be drawn. Use the address below.
        </p>
      )}
    </div>
  );
}
