import { useMemo } from "react";
import type { BreakevenResponse } from "../../api/types";
import { CARRIER_NAME, formatInt, formatUsd } from "../../lib/format";
import { cellGrid } from "./readout";

/** The map as a plain table: the accessible and printable alternative to the heatmap. */
export function BreakevenTable({ res, id }: { res: BreakevenResponse; id: string }) {
  const grid = useMemo(() => cellGrid(res), [res]);
  return (
    <div className="hmt" id={id}>
      <table className="hmt__table">
        <caption>
          Cheapest ground carrier and its price by weight and distance ({res.residential ? "home" : "business"} delivery,{" "}
          {res.year}). The second line is how much more the next cheapest carrier costs.
        </caption>
        <thead>
          <tr>
            <th scope="col">Weight</th>
            {res.distances_miles.map((d, c) => (
              <th key={d} scope="col" className="num">
                {formatInt(d)} mi
                <span className="hmt__zone">zone {res.breakeven_weight_lb[c]?.zone_usps ?? "—"}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {res.weights_lb.map((w, r) => (
            <tr key={w}>
              <th scope="row">{w} lb</th>
              {res.distances_miles.map((d, c) => {
                const cell = grid[r]?.[c];
                if (!cell?.winner) return <td key={d}>—</td>;
                return (
                  <td key={d} className={`num hmt__cell hmt__cell--${cell.winner.carrier}`}>
                    <span className="hmt__who">{CARRIER_NAME[cell.winner.carrier]}</span> {formatUsd(cell.winner.total)}
                    {cell.runner_up && <span className="hmt__next">next +{formatUsd(cell.saving)}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
