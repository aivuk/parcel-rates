import type { Meta } from "../api/types";

export function Footer({ meta, status }: { meta: Meta | null; status: string }) {
  return (
    <footer className="footer">
      <h2 className="kicker">What these numbers leave out</h2>
      {meta ? (
        <ul className="footer__limits">
          {meta.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="footer__pending">
          {status === "error" ? "Data limitations are listed once the rate service answers." : "Loading data notes…"}
        </p>
      )}
      <p className="footer__note">
        Prices come from each carrier's published documents, committed with the source file and page. No live data is
        fetched.
      </p>
    </footer>
  );
}
