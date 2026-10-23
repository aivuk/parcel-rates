import "../styles/views.css";

/** Handlers for the parcel set, passed down from App so a view's empty state can fill it. */
export interface ParcelActions {
  /** Load the bundled sample mix. */
  onLoadSample: () => void;
  /** Open the CSV file picker of the "Your parcels" panel. */
  onUploadCsv: () => void;
}

/** Empty state for the questions that price a whole parcel set (Q3, Q4). */
export function NeedParcels({ what, onLoadSample, onUploadCsv }: { what: string } & ParcelActions) {
  return (
    <div className="need-parcels" data-testid="need-parcels">
      <p className="need-parcels__lead">This question prices your whole mix of parcels.</p>
      <p className="need-parcels__text">{what}</p>
      <div className="need-parcels__actions">
        <button type="button" className="btn btn--primary" onClick={onLoadSample}>
          Load the sample mix
        </button>
        <button type="button" className="btn" onClick={onUploadCsv}>
          Upload CSV
        </button>
      </div>
    </div>
  );
}
