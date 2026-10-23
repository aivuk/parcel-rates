import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useApi, useLoad } from "./api/ApiContext";
import { isMockMode } from "./api/client";
import { ControlRail, assumptionsLine } from "./components/controls/ControlRail";
import { ParcelSetPanel } from "./components/parcels/ParcelSetPanel";
import { QuestionTabs } from "./components/QuestionTabs";
import { Footer } from "./components/Footer";
import { useParcelSet } from "./hooks/useParcelSet";
import { useUrlState } from "./hooks/useUrlState";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { INERT_WHILE_SHEET, SHEET_QUERY, useSheet } from "./hooks/useSheet";
import { controlsFromMeta, type ViewId } from "./state/urlState";
import type { ViewProps } from "./views/types";
import { QuoteView } from "./views/QuoteView";
import { BreakevenView } from "./views/BreakevenView";
import { BlendedView } from "./views/BlendedView";
import { YearlyView } from "./views/YearlyView";

const VIEW_COMPONENTS: Record<ViewId, (p: ViewProps) => JSX.Element> = {
  quote: QuoteView,
  breakeven: BreakevenView,
  blended: BlendedView,
  yearly: YearlyView,
};


export function App() {
  const api = useApi();
  const [metaAttempt, setMetaAttempt] = useState(0);
  const metaState = useLoad((signal) => api.meta(signal), [api, metaAttempt]);
  const meta = metaState.status === "ok" ? metaState.data : null;
  const metaDefaults = useMemo(() => (meta ? controlsFromMeta(meta.defaults) : null), [meta]);
  const [state, dispatch] = useUrlState(metaDefaults);
  const parcelSet = useParcelSet();
  const isSheet = useMediaQuery(SHEET_QUERY);
  const sheet = useSheet(isSheet);
  const railId = useId();
  const railTitleId = useId();
  const inert = { [INERT_WHILE_SHEET]: "" };
  const mock = isMockMode();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const viewProps: ViewProps = {
    controls: state.controls,
    meta,
    parcels: parcelSet.set?.parcels ?? null,
    onLoadSample: parcelSet.loadSample,
    onUploadCsv: openFilePicker,
  };

  return (
    <>
      <a className="skip-link" href="#main" {...inert}>
        Skip to the questions
      </a>
      {mock && (
        <p className="mock-banner" role="note" {...inert}>
          <strong>Mock data.</strong> Recorded example answers from the rate service; they do not change with your inputs.
        </p>
      )}
      <header className="masthead" {...inert}>
        <div className="masthead__inner">
          <p className="kicker masthead__edition">
            {state.controls.year} published list prices · USPS, UPS, FedEx
          </p>
          <h1 className="masthead__title">Parcel Rates</h1>
          <p className="masthead__deck">
            Which carrier is cheapest for each kind of parcel you ship, and does your flat shipping price still cover
            the real cost after surcharges and yearly increases?
          </p>
        </div>
      </header>

      <div className="mobile-bar" {...inert}>
        <p className="mobile-bar__line">{assumptionsLine(state)}</p>
        <button
          ref={sheet.toggleRef}
          type="button"
          className="btn mobile-bar__toggle"
          aria-expanded={sheet.open}
          aria-controls={railId}
          onClick={() => sheet.setOpen(!sheet.open)}
        >
          Adjust
        </button>
      </div>

      <div className="layout">
        {sheet.open && (
          <div className="sheet-backdrop" aria-hidden="true" onClick={sheet.close} />
        )}
        <aside
          id={railId}
          ref={sheet.sheetRef}
          className={`rail ${sheet.open ? "rail--open" : ""}`}
          aria-labelledby={railTitleId}
          {...(sheet.open ? { role: "dialog", "aria-modal": true } : {})}
        >
          <div className="rail__head">
            <h2 id={railTitleId} className="kicker rail__title">
              Assumptions
            </h2>
            <button type="button" className="btn btn--quiet rail__close" onClick={sheet.close}>
              Done
            </button>
          </div>
          <ControlRail
            state={state}
            dispatch={dispatch}
            meta={meta}
            metaStatus={metaState.status === "ok" ? "ok" : metaState.status}
            onRetryMeta={() => setMetaAttempt((n) => n + 1)}
          />
        </aside>

        <main id="main" className="main" tabIndex={-1} {...inert}>
          <ParcelSetPanel
            set={parcelSet.set}
            status={parcelSet.status}
            zoneBands={meta?.zone_bands}
            onLoadSample={parcelSet.loadSample}
            onLoadFile={parcelSet.loadFile}
            onClear={parcelSet.clear}
            fileInputRef={fileInputRef}
          />
          <QuestionTabs
            active={state.view}
            onSelect={(view) => dispatch({ type: "view", view })}
            renderPanel={(id) => {
              const View = VIEW_COMPONENTS[id];
              return <View {...viewProps} />;
            }}
          />
          <Footer meta={meta} status={metaState.status} />
        </main>
      </div>
    </>
  );
}
