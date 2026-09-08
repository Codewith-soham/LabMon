import type { MouseEvent, ReactNode } from 'react';

interface DetailModalProps {
  label: string;
  title: ReactNode;
  onClose: () => void;
  overlayClassName?: string;
  cardClassName?: string;
  wrapBody?: boolean;
  headerExtra?: ReactNode;
  children: ReactNode;
}

function DetailModal({
  label,
  title,
  onClose,
  overlayClassName = '',
  cardClassName = '',
  wrapBody = true,
  headerExtra,
  children,
}: DetailModalProps) {
  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={`detail-overlay ${overlayClassName}`.trim()} onClick={handleOverlayClick}>
      <div className={`detail-card ${cardClassName}`.trim()}>
        <div className="detail-header">
          <div>
            <p className="portal-label">{label}</p>
            <h1 className="brand-title" style={{ fontSize: 22 }}>
              {title}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {headerExtra}
            <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        {wrapBody ? <div className="detail-body">{children}</div> : children}
      </div>
    </div>
  );
}

export default DetailModal;
