import React from "react";

/**
 * cardHand — how THIS book's text cards are dressed (2026-11-20, YPP "generic or repetitive content").
 *
 * Measured on the channel's Vox films: the text cards (statement, question, quote, list, …) are a median 47 % of a
 * film's time, and every one of them carried the same three marks in every film — a ring with a dotted disc behind the
 * words, a red tag with a hard shadow above them, a rounded marker line under them. A book's skin (meta.skin.plate,
 * scripts/lib/book-skin.js) now picks how those three are drawn:
 *   dark    the channel's marks, exactly as before (also every film without a skin)
 *   paper   a tilted ruled sheet behind the words · an outlined label · two thin rules
 *   sharp   corner brackets · a square ink tag with a red edge · a straight square bar
 *   accent  a slanted colour band at the side · a gold tag · a marker line in gold
 * It dresses the card; the words, their size, place and timing are untouched. No motion of its own beyond the entrance
 * the mark already had (the paper / sharp / accent marks do not rotate).
 */
export type CardHand = "dark" | "paper" | "sharp" | "accent";
const HANDS: readonly CardHand[] = ["dark", "paper", "sharp", "accent"];
export const cardHandOf = (skin?: { plate?: string } | null): CardHand => (skin && (HANDS as readonly string[]).includes(String(skin.plate)) ? (skin.plate as CardHand) : "dark");

export const CardHandContext = React.createContext<CardHand>("dark");
export const useCardHand = () => React.useContext(CardHandContext);
