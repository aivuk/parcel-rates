import { ApiError } from "../api/client";

/** A failed API call, with the field-level problems of a 422 when there are any. */
export function LoadProblem({ error }: { error: Error }) {
  const problems = error instanceof ApiError ? error.problems : [];
  return (
    <div className="problems problems--error" role="alert">
      <p className="problems__title">{error.message}</p>
      {problems.length > 0 && (
        <ul className="problems__list">
          {problems.slice(0, 8).map((p, i) => (
            <li key={i}>
              {p.field && <span className="problems__where">{p.field}</span>}
              <span>{p.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
