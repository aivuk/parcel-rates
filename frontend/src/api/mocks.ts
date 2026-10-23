/**
 * Mock responses for tests and the `?mock=1` dev mode, built from the backend's recorded
 * example payloads in ./__fixtures__ (see the README there). Every body passes through the
 * runtime guards, so a fixture that drifts from ./types.ts fails loudly here too.
 *
 * The answers are real engine output for the recorded request; they do not react to a
 * different request.
 */
import blendedFx from "./__fixtures__/blended.json";
import breakevenFx from "./__fixtures__/breakeven.json";
import metaFx from "./__fixtures__/meta.json";
import quote422Fx from "./__fixtures__/quote-422.json";
import quoteFx from "./__fixtures__/quote.json";
import sampleFx from "./__fixtures__/sample-parcels.json";
import yearlyFx from "./__fixtures__/yearly.json";
import {
  asBlendedResponse,
  asBreakevenResponse,
  asMeta,
  asQuoteResponse,
  asSampleParcels,
  asValidationError,
  asYearlyResponse,
} from "./guards";
import type { Meta } from "./types";
import type { ControlsState } from "../state/urlState";

export const mockMeta: Meta = asMeta(metaFx.response.body);
export const mockSampleParcels = asSampleParcels(sampleFx.response.body);
export const mockQuoteResponse = asQuoteResponse(quoteFx.response.body);
export const mockQuote422Body = asValidationError(quote422Fx.response.body);
export const mockBreakevenResponse = asBreakevenResponse(breakevenFx.response.body);
export const mockBlendedResponse = asBlendedResponse(blendedFx.response.body);
export const mockYearlyResponse = asYearlyResponse(yearlyFx.response.body);

export const mockDefaultControls: ControlsState = {
  year: mockMeta.defaults.year,
  usps_rate_card: mockMeta.defaults.usps_rate_card,
  peak: mockMeta.defaults.peak,
  flat_price: mockMeta.defaults.flat_price,
};

export const mockQuote = () => mockQuoteResponse;
export const mockBreakeven = () => mockBreakevenResponse;
export const mockBlended = () => mockBlendedResponse;
export const mockYearly = () => mockYearlyResponse;
