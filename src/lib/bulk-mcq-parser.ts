import * as XLSX from "xlsx";

export interface ParsedMcqRow {
  rowNumber: number;
  questionNumber?: number;
  prompt: string;
  instructions?: string;
  points: number;
  options: Array<{ optionKey: string; text: string; scopeTag?: string }>;
  correctOptionKey: string;
  explanation?: string;
  scoringGuide?: string;
  errors: string[];
  isValid: boolean;
}

export interface McqImportPreviewResult {
  success: boolean;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  rows: ParsedMcqRow[];
  globalErrors: string[];
}

/**
 * Standard CSV parser handling quotes, commas, CRLF.
 */
export function parseCsvText(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, ""); // remove BOM
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

/**
 * Parses XLSX / XLS buffer into a 2D string array.
 */
export function parseExcelBuffer(buffer: Buffer | ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  return jsonData.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim())
  );
}

/**
 * Generates sample CSV template content.
 */
export function generateMcqCsvTemplate(): string {
  const headers = [
    "QuestionNumber",
    "Prompt",
    "Instructions",
    "Points",
    "OptionA",
    "OptionB",
    "OptionC",
    "OptionD",
    "CorrectAnswer",
    "Explanation",
    "ScoringGuide",
  ];

  const sampleRows = [
    [
      "1",
      "Which strategic marketing matrix evaluates market growth vs. relative market share?",
      "Select the single most accurate framework.",
      "10",
      "Ansoff Matrix",
      "BCG Growth-Share Matrix",
      "Porter Five Forces",
      "SWOT Analysis",
      "B",
      "The BCG Matrix classifies business units into Stars, Question Marks, Cash Cows, and Dogs based on market growth and relative market share.",
      "Award full points for identifying BCG Growth-Share Matrix.",
    ],
    [
      "2",
      "In corporate financial analysis, what does a current ratio below 1.0 generally indicate?",
      "Choose the primary liquidity implication.",
      "10",
      "Strong long-term debt solvency",
      "Potential short-term liquidity strain",
      "High return on equity",
      "Optimal working capital allocation",
      "B",
      "A current ratio under 1.0 means short-term obligations exceed current liquid assets.",
      "Award full points for Option B.",
    ],
    [
      "3",
      "What is the primary role of a Key Performance Indicator (KPI) in agile product development?",
      "",
      "10",
      "Guarantees 100% bug-free deployments",
      "Provides measurable alignment toward strategic outcomes",
      "Replaces all daily standup meetings",
      "Enforces fixed micro-management deadlines",
      "B",
      "KPIs ensure measurable alignment with team and organizational objectives.",
      "Standard 10 marks for option B.",
    ],
  ];

  const lines = [
    headers.join(","),
    ...sampleRows.map((row) =>
      row
        .map((cell) => {
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(",")
    ),
  ];

  return lines.join("\n");
}

/**
 * Generates XLSX template as a binary Buffer or base64.
 */
export function generateMcqExcelTemplateBase64(): string {
  const headers = [
    "QuestionNumber",
    "Prompt",
    "Instructions",
    "Points",
    "OptionA",
    "OptionB",
    "OptionC",
    "OptionD",
    "CorrectAnswer",
    "Explanation",
    "ScoringGuide",
  ];

  const sampleData = [
    headers,
    [
      1,
      "Which strategic marketing matrix evaluates market growth vs. relative market share?",
      "Select the single most accurate framework.",
      10,
      "Ansoff Matrix",
      "BCG Growth-Share Matrix",
      "Porter Five Forces",
      "SWOT Analysis",
      "B",
      "The BCG Matrix classifies business units into Stars, Question Marks, Cash Cows, and Dogs based on market growth and relative market share.",
      "Award full points for identifying BCG Growth-Share Matrix.",
    ],
    [
      2,
      "In corporate financial analysis, what does a current ratio below 1.0 generally indicate?",
      "Choose the primary liquidity implication.",
      10,
      "Strong long-term debt solvency",
      "Potential short-term liquidity strain",
      "High return on equity",
      "Optimal working capital allocation",
      "B",
      "A current ratio under 1.0 means short-term obligations exceed current liquid assets.",
      "Award full points for Option B.",
    ],
    [
      3,
      "What is the primary role of a Key Performance Indicator (KPI) in agile product development?",
      "",
      10,
      "Guarantees 100% bug-free deployments",
      "Provides measurable alignment toward strategic outcomes",
      "Replaces all daily standup meetings",
      "Enforces fixed micro-management deadlines",
      "B",
      "KPIs ensure measurable alignment with team and organizational objectives.",
      "Standard 10 marks for option B.",
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "MCQ_Template");

  // Write workbook to base64
  const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
  return base64;
}

/**
 * Maps header strings to normalized column indices.
 */
function findColumnIndices(headerRow: string[]) {
  const map: Record<string, number> = {};

  for (let idx = 0; idx < headerRow.length; idx++) {
    const raw = (headerRow[idx] || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!raw) continue;

    if (["questionnumber", "qno", "no", "qnumber", "itemnumber"].includes(raw)) {
      map.questionNumber = idx;
    } else if (["prompt", "question", "questiontext", "title"].includes(raw)) {
      map.prompt = idx;
    } else if (["instructions", "instruction", "guidance"].includes(raw)) {
      map.instructions = idx;
    } else if (["points", "marks", "score", "totalpoints"].includes(raw)) {
      map.points = idx;
    } else if (["optiona", "a", "choicea"].includes(raw)) {
      map.optionA = idx;
    } else if (["optionb", "b", "choiceb"].includes(raw)) {
      map.optionB = idx;
    } else if (["optionc", "c", "choicec"].includes(raw)) {
      map.optionC = idx;
    } else if (["optiond", "d", "choiced"].includes(raw)) {
      map.optionD = idx;
    } else if (["optione", "e", "choicee"].includes(raw)) {
      map.optionE = idx;
    } else if (
      ["correctanswer", "correctoption", "answer", "correctkey", "key", "correct"].includes(raw)
    ) {
      map.correctAnswer = idx;
    } else if (["explanation", "rationale", "solution"].includes(raw)) {
      map.explanation = idx;
    } else if (["scoringguide", "rubric", "guide", "rubricguide"].includes(raw)) {
      map.scoringGuide = idx;
    }
  }

  return map;
}

export interface ExistingQuestionContext {
  existingQuestionNumbers: Set<number>;
  existingPromptsNormalized: Set<string>;
  maxExistingQuestionNumber: number;
}

/**
 * Normalizes and validates raw table rows against task context.
 */
export function validateMcqRows(
  rows: string[][],
  existingContext: ExistingQuestionContext
): McqImportPreviewResult {
  const globalErrors: string[] = [];

  if (!rows || rows.length === 0) {
    return {
      success: false,
      totalRows: 0,
      validRowsCount: 0,
      invalidRowsCount: 0,
      rows: [],
      globalErrors: ["Uploaded file is empty."],
    };
  }

  const headerRow = rows[0];
  const colMap = findColumnIndices(headerRow);

  if (colMap.prompt === undefined) {
    globalErrors.push("Missing required column: 'Prompt' or 'Question'.");
  }
  if (colMap.optionA === undefined || colMap.optionB === undefined) {
    globalErrors.push("Missing required option columns: 'OptionA' and 'OptionB' are required.");
  }
  if (colMap.correctAnswer === undefined) {
    globalErrors.push("Missing required column: 'CorrectAnswer' or 'Answer'.");
  }

  if (globalErrors.length > 0) {
    return {
      success: false,
      totalRows: rows.length - 1,
      validRowsCount: 0,
      invalidRowsCount: rows.length - 1,
      rows: [],
      globalErrors,
    };
  }

  const dataRows = rows.slice(1);
  const parsedRows: ParsedMcqRow[] = [];
  const seenFileQuestionNumbers = new Set<number>();
  const seenFilePrompts = new Set<string>();

  let nextAutoNumber = existingContext.maxExistingQuestionNumber + 1;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2; // 1-based index including header
    const rowErrors: string[] = [];

    // Skip empty lines
    if (row.every((cell) => !cell || !cell.trim())) {
      continue;
    }

    // 1. Question Number
    let qNum: number | undefined = undefined;
    if (colMap.questionNumber !== undefined && row[colMap.questionNumber]) {
      const parsedNum = parseInt(row[colMap.questionNumber].trim(), 10);
      if (isNaN(parsedNum) || parsedNum <= 0) {
        rowErrors.push("Question number must be a positive integer.");
      } else {
        qNum = parsedNum;
      }
    }

    // If question number is not provided, auto-assign next number
    if (qNum === undefined) {
      while (
        existingContext.existingQuestionNumbers.has(nextAutoNumber) ||
        seenFileQuestionNumbers.has(nextAutoNumber)
      ) {
        nextAutoNumber++;
      }
      qNum = nextAutoNumber;
      nextAutoNumber++;
    } else {
      // Check for collision with existing questions in task
      if (existingContext.existingQuestionNumbers.has(qNum)) {
        rowErrors.push(
          `Question number ${qNum} already exists in this task. Overwriting is not permitted.`
        );
      }
      // Check for duplicate inside the same uploaded file
      if (seenFileQuestionNumbers.has(qNum)) {
        rowErrors.push(`Duplicate Question number ${qNum} within this file.`);
      }
      seenFileQuestionNumbers.add(qNum);
    }

    // 2. Prompt
    const rawPrompt = colMap.prompt !== undefined ? (row[colMap.prompt] || "").trim() : "";
    if (!rawPrompt || rawPrompt.length < 3) {
      rowErrors.push("Question prompt is required and must be at least 3 characters.");
    }
    const normalizedPrompt = rawPrompt.toLowerCase().replace(/\s+/g, " ");
    if (existingContext.existingPromptsNormalized.has(normalizedPrompt)) {
      rowErrors.push("A question with this identical prompt already exists in this task.");
    }
    if (seenFilePrompts.has(normalizedPrompt)) {
      rowErrors.push("Duplicate prompt appears multiple times in this file.");
    }
    if (rawPrompt.length >= 3) {
      seenFilePrompts.add(normalizedPrompt);
    }

    // 3. Points
    let points = 10;
    if (colMap.points !== undefined && row[colMap.points]) {
      const parsedPoints = parseInt(row[colMap.points].trim(), 10);
      if (isNaN(parsedPoints) || parsedPoints < 1 || parsedPoints > 1000) {
        rowErrors.push("Points must be an integer between 1 and 1000.");
      } else {
        points = parsedPoints;
      }
    }

    // 4. Options
    const options: Array<{ optionKey: string; text: string }> = [];
    const optionDefinitions = [
      { key: "A", col: colMap.optionA },
      { key: "B", col: colMap.optionB },
      { key: "C", col: colMap.optionC },
      { key: "D", col: colMap.optionD },
      { key: "E", col: colMap.optionE },
    ];

    for (const def of optionDefinitions) {
      if (def.col !== undefined && row[def.col]) {
        const text = row[def.col].trim();
        if (text) {
          options.push({ optionKey: def.key, text });
        }
      }
    }

    if (options.length < 2) {
      rowErrors.push("At least two non-empty options (e.g. Option A and Option B) are required.");
    }

    // 5. Correct Answer
    const rawAnswer =
      colMap.correctAnswer !== undefined ? (row[colMap.correctAnswer] || "").trim() : "";
    let matchedOptionKey = "";

    if (!rawAnswer) {
      rowErrors.push("Correct answer is required.");
    } else {
      // Normalize answer: "A", "Option A", "Choice A", or exact text match
      const upper = rawAnswer.toUpperCase().replace(/^OPTION\s*|^CHOICE\s*/, "").trim();
      const directKeyMatch = options.find((o) => o.optionKey === upper);
      if (directKeyMatch) {
        matchedOptionKey = directKeyMatch.optionKey;
      } else {
        // Try finding by option text
        const textMatch = options.find(
          (o) => o.text.trim().toLowerCase() === rawAnswer.toLowerCase()
        );
        if (textMatch) {
          matchedOptionKey = textMatch.optionKey;
        } else {
          rowErrors.push(
            `Correct answer "${rawAnswer}" does not match any provided option (${options
              .map((o) => o.optionKey)
              .join(", ")}).`
          );
        }
      }
    }

    // 6. Optional fields
    const instructions =
      colMap.instructions !== undefined && row[colMap.instructions]
        ? row[colMap.instructions].trim()
        : undefined;
    const explanation =
      colMap.explanation !== undefined && row[colMap.explanation]
        ? row[colMap.explanation].trim()
        : undefined;
    const scoringGuide =
      colMap.scoringGuide !== undefined && row[colMap.scoringGuide]
        ? row[colMap.scoringGuide].trim()
        : undefined;

    parsedRows.push({
      rowNumber,
      questionNumber: qNum,
      prompt: rawPrompt,
      instructions,
      points,
      options,
      correctOptionKey: matchedOptionKey,
      explanation,
      scoringGuide,
      errors: rowErrors,
      isValid: rowErrors.length === 0,
    });
  }

  const validRowsCount = parsedRows.filter((r) => r.isValid).length;
  const invalidRowsCount = parsedRows.filter((r) => !r.isValid).length;

  return {
    success: true,
    totalRows: parsedRows.length,
    validRowsCount,
    invalidRowsCount,
    rows: parsedRows,
    globalErrors,
  };
}

