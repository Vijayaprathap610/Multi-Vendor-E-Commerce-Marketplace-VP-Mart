import { Accordion, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useSeo } from '../../hooks/useSeo.js';
import { PAGES, POLICY_NOTICE } from './content.js';

export default function StaticPage({ page }) {
  const c = PAGES[page];
  useSeo({ title: c.title, description: c.description, path: `/${page}` });
  return (
    <article className="container vp-static">
      <h1 className="vp-h1-page">{c.title}</h1>
      {c.policy && (
        <Alert variant="warning" className="small">
          {POLICY_NOTICE}
        </Alert>
      )}
      {c.sections?.map((s) => (
        <section key={s.h} id={s.id}>
          <h2 className="h5">{s.h}</h2>
          {s.p.map((t) => (
            <p key={t}>{t}</p>
          ))}
          {s.link && (
            <Link to={s.link[0]} className="btn btn-dark btn-sm">
              {s.link[1]}
            </Link>
          )}
        </section>
      ))}
      {c.faq && (
        <Accordion flush alwaysOpen>
          {c.faq.map(([q, a], i) => (
            <Accordion.Item eventKey={String(i)} key={q}>
              <Accordion.Header as="h2">{q}</Accordion.Header>
              <Accordion.Body>{a}</Accordion.Body>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </article>
  );
}
