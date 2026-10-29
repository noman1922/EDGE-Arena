/**
 * Marks and Score Formatting Utility
 *
 * Provides unambiguous human-readable and spelled-out textual representations of marks
 * to guarantee that critical deduction amounts (e.g., 5 marks vs 55 marks) cannot be
 * confused in confirmation dialogs or audit records.
 */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function smallNumberToWords(n: number): string {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return TENS[ten] + (one > 0 ? `-${ONES[one]}` : "");
}

/**
 * Converts a positive number to uppercase English words for prominent confirmation dialogs.
 * Examples:
 *   5    -> "FIVE MARKS"
 *   55   -> "FIFTY-FIVE MARKS"
 *   10   -> "TEN MARKS"
 *   0.5  -> "ZERO POINT FIVE MARKS"
 *   100  -> "ONE HUNDRED MARKS"
 */
export function formatMarksInWords(marks: number): string {
  if (typeof marks !== "number" || isNaN(marks)) {
    return "ZERO MARKS";
  }

  const rounded = Math.round(marks * 100) / 100;
  const integerPart = Math.floor(rounded);
  const decimalPart = Math.round((rounded - integerPart) * 100);

  let words = "";
  if (integerPart < 100) {
    words = smallNumberToWords(integerPart);
  } else if (integerPart < 1000) {
    const hundred = Math.floor(integerPart / 100);
    const rest = integerPart % 100;
    words = `${ONES[hundred]} hundred` + (rest > 0 ? ` ${smallNumberToWords(rest)}` : "");
  } else {
    words = `${integerPart}`;
  }

  if (decimalPart > 0) {
    if (decimalPart % 10 === 0) {
      words += ` point ${ONES[decimalPart / 10]}`;
    } else {
      words += ` point ${smallNumberToWords(decimalPart)}`;
    }
  }

  const unit = rounded === 1 ? "MARK" : "MARKS";
  return `${words.toUpperCase()} ${unit}`;
}

