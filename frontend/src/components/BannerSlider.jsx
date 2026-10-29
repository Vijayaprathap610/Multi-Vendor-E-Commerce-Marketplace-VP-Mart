import { useEffect, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiPause, FiPlay } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { catalogService } from '../services/catalogService.js';

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Promotional slider. Auto-advance pauses on hover/focus, can be paused with a button
// (WCAG 2.2.2), and never auto-advances when the user prefers reduced motion.
export default function BannerSlider({ banners, interval = 6000 }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(reduced());
  const [hover, setHover] = useState(false);
  const count = banners.length;
  const timer = useRef();

  useEffect(() => {
    if (count < 2 || paused || hover) return undefined;
    timer.current = setInterval(() => setI((n) => (n + 1) % count), interval);
    return () => clearInterval(timer.current);
  }, [count, paused, hover, interval]);

  if (!count) return null;
  const go = (n) => setI((n + count) % count);
  const slideClick = (b) => catalogService.bannerClick(b.id);

  return (
    <section
      className="vp-hero"
      aria-roledescription="carousel"
      aria-label="Promotions"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div
        className="vp-hero-track"
        style={{ transform: `translateX(-${i * 100}%)` }}
        aria-live={paused || hover ? 'polite' : 'off'}
      >
        {banners.map((b, n) => {
          const external = /^https:\/\//i.test(b.destination);
          const body = (
            <>
              <img
                src={b.imageUrl}
                alt=""
                width="1600"
                height="520"
                loading={n === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
              <span className="vp-hero-copy">
                <span className="visually-hidden">{`Promotion ${n + 1} of ${count}:`}</span>{' '}
                <span className="vp-hero-title">{b.title}</span>
                {b.description && <span className="vp-hero-desc">{b.description}</span>}
                {b.ctaLabel && <span className="vp-hero-cta">{b.ctaLabel}</span>}
              </span>
            </>
          );
          const common = {
            className: 'vp-hero-slide',
            'aria-roledescription': 'slide',
            tabIndex: n === i ? 0 : -1,
            onClick: () => slideClick(b),
          };
          return external ? (
            <a
              key={b.id}
              href={b.destination}
              target="_blank"
              rel="noopener noreferrer"
              {...common}
            >
              {body}
            </a>
          ) : (
            <Link key={b.id} to={b.destination} {...common}>
              {body}
            </Link>
          );
        })}
      </div>
      {count > 1 && (
        <div className="vp-hero-ctl">
          <button type="button" aria-label="Previous promotion" onClick={() => go(i - 1)}>
            <FiChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={paused ? 'Start automatic rotation' : 'Pause automatic rotation'}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}
          </button>
          <button type="button" aria-label="Next promotion" onClick={() => go(i + 1)}>
            <FiChevronRight aria-hidden="true" />
          </button>
          <span className="vp-hero-dots" role="group" aria-label="Choose promotion">
            {banners.map((b, n) => (
              <button
                key={b.id}
                type="button"
                className={n === i ? 'on' : ''}
                aria-label={`Show promotion ${n + 1}`}
                aria-current={n === i}
                onClick={() => setI(n)}
              />
            ))}
          </span>
        </div>
      )}
    </section>
  );
}
