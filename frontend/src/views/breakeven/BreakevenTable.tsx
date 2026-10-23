import { useId, useMemo, useState } from "react";
import type { BreakevenResponse, Meta } from "../../api/types";
import { CARRIERS } from "../../api/types";
import { cellGrid, groundName, zoneLabel } from "./readout";
import { CARRIER_NAME } from "../../lib/carriers";
import { formatInt, formatUsd } from "../../lib/format";

/**
 * The map as a plain table, one distance band at a time: every carrier's total per weight, the
 * cheapest and its saving. Carries at least what the heatmap tooltip carries.
 */
export function BreakevenTable({ res, meta, id }: { res: BreakevenResponse; meta: Meta | null; id: string }) {
  const grid = useMemo(() => cellGrid(res), [res]);
  const [col, setCol] = useState(0);
  const uid = useId();
  const carriers = CARRIERS.filter((c) => res.cells.some((x) => x.totals[c] !== undefined));
  const band = res.breakeven_weight_lb[col];
  const zones = band ? zoneLabel(band.zone_usps, band.zone_private) : "";
  const distance = res.distances_miles[col] ?? 0;
  const caption = `Ground prices at ${formatInt(distance)} mi (${zones}), ${res.residential ? "home" : "business"} delivery, ${res.year}. Saving is against the next cheapest carrier.`;

  return (
    <div className="hmt" id={id}>
      <div className="hmt__pick">
        <label className="control__label" htmlFor={`${uid}-band`}>
          Distance
        </label>
        <select id={`${uid}-band`} className="select" value={col} onChange={(e) => setCol(Number(e.target.value))}>
          {res.distances_miles.map((d, c) => {
            const b = res.breakeven_weight_lb[c];
            return (
              <option key={d} value={c}>
                {formatInt(d)} mi, {b ? zoneLabel(b.zone_usps, b.zone_private) : ""}
              </option>
            );
          })}
        </select>
      </div>
      <p className="hmt__caption" aria-hidden="true">
        {caption}
      </p>
      <div className="hmt__scroll">
        <table className="hmt__table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Weight</th>
              {carriers.map((c) => (
                <th key={c} scope="col" className="num">
                  {groundName(meta, c, res.residential)}
                </th>
              ))}
              <th scope="col">Cheapest</th>
              <th scope="col" className="num">
                Saving
              </th>
            </tr>
          </thead>
          <tbody>
            {res.weights_lb.map((w, r) => {
              const cell = grid[r]?.[col] ?? null;
              const win = cell?.winner?.carrier;
              return (
                <tr key={w}>
                  <th scope="row">{w} lb</th>
                  {carriers.map((c) => {
                    const t = cell?.totals[c];
                    return (
                      <td key={c} className={`num ${win === c ? "hmt__win" : ""}`}>
                        {t === undefined ? "—" : formatUsd(t)}
                      </td>
                    );
                  })}
                  <td className={win ? `hmt__who hmt__who--${win}` : undefined}>{win ? CARRIER_NAME[win] : "none"}</td>
                  <td className="num">
                    {cell?.runner_up ? `${formatUsd(cell.saving)} vs ${CARRIER_NAME[cell.runner_up.carrier]}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
