import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import {
  parseCsvText,
  parseExcelBuffer,
  generateMcqCsvTemplate,
  generateMcqExcelTemplateBase64,
  validateMcqRows,
} from "../lib/bulk-mcq-parser";
import {
  previewBulkMcqImportAction,
  executeBulkMcqImportAction,
  getMcqTemplateAction,
} from "../app/actions/task-builder-actions";
import * as XLSX from "xlsx";

describe("Feature 2: Bulk MCQ Import (CSV & XLSX)", () => {
  const testAdminId = "77000000-0000-4000-8000-000000000001";
  const testParticipantId = "77000000-0000-4000-8000-000000000002";
  const testContestId = "77000000-0000-4000-8000-000000000010";
  const testPhaseId = "77000000-0000-4000-8000-000000000011";
  const testTaskId = "77000000-0000-4000-8000-000000000012";
  const testExistingQId = "77000000-0000-4000-8000-000000000013";

  before(async () => {
    // 1. Seed admin & participant
    await prisma.user.upsert({
      where: { id: testAdminId },
      update: { role: UserRole.ADMIN },
      create: {
        id: testAdminId,
        email: "mcq.admin@aciedge.edu",
        name: "MCQ Test Admin",
        role: UserRole.ADMIN,
      },
    });

    await prisma.user.upsert({
      where: { id: testParticipantId },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: testParticipantId,
        email: "mcq.participant@aciedge.edu",
        name: "MCQ Participant",
        role: UserRole.PARTICIPANT,
      },
    });

    // 2. Seed contest, phase, task
    await prisma.contest.upsert({
      where: { id: testContestId },
      update: { status: ContestStatus.LIVE },
      create: {
        id: testContestId,
        title: "Bulk MCQ Test Contest",
        slug: "bulk-mcq-test-contest",
        track: "Marketing",
        status: ContestStatus.LIVE,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
      },
    });

    await prisma.phase.upsert({
      where: { id: testPhaseId },
      update: { status: PhaseStatus.OPEN },
      create: {
        id: testPhaseId,
        contestId: testContestId,
        phaseNumber: 1,
        title: "Phase 1 - MCQs",
        weightPercentage: 50,
        deadline: new Date("2026-11-30T18:00:00Z"),
        status: PhaseStatus.OPEN,
      },
    });

    await prisma.task.upsert({
      where: { id: testTaskId },
      update: { totalPoints: 10 },
      create: {
        id: testTaskId,
        phaseId: testPhaseId,
        taskNumber: 1,
        title: "MCQ Screening Task",
        totalPoints: 10,
      },
    });

    // Seed 1 existing question in the task (Q# 1)
    await prisma.question.upsert({
      where: { id: testExistingQId },
      update: { questionNumber: 1, points: 10 },
      create: {
        id: testExistingQId,
        taskId: testTaskId,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "Existing Task Question One",
        points: 10,
        isMandatory: true,
        options: {
          create: [
            { optionKey: "A", text: "Alpha" },
            { optionKey: "B", text: "Beta" },
          ],
        },
        answerKey: {
          create: {
            correctOptionKey: "A",
            explanation: "Alpha is correct",
          },
        },
      },
    });
  });

  after(async () => {
    setTestSession(null);
    // Cleanup
    await prisma.mcqOption.deleteMany({
      where: { question: { taskId: testTaskId } },
    });
    await prisma.questionAnswerKey.deleteMany({
      where: { question: { taskId: testTaskId } },
    });
    await prisma.question.deleteMany({ where: { taskId: testTaskId } });
    await prisma.task.deleteMany({ where: { id: testTaskId } });
    await prisma.phase.deleteMany({ where: { id: testPhaseId } });
    await prisma.contest.deleteMany({ where: { id: testContestId } });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [testAdminId, testParticipantId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testAdminId, testParticipantId] } },
    });
  });

  // ==========================================
  // 1. Template Generation Tests
  // ==========================================
  describe("MCQ Template Generators", () => {
    test("generates valid CSV template with expected headers", () => {
      const csv = generateMcqCsvTemplate();
      assert.ok(csv.includes("QuestionNumber"));
      assert.ok(csv.includes("Prompt"));
      assert.ok(csv.includes("OptionA"));
      assert.ok(csv.includes("OptionB"));
      assert.ok(csv.includes("CorrectAnswer"));
      assert.ok(csv.includes("Explanation"));
      assert.ok(csv.includes("ScoringGuide"));

      const parsed = parseCsvText(csv);
      assert.ok(parsed.length >= 4); // header + 3 sample rows
      assert.equal(parsed[0][0], "QuestionNumber");
    });

    test("generates valid Excel (.xlsx) template buffer", () => {
      const base64 = generateMcqExcelTemplateBase64();
      assert.ok(base64 && base64.length > 50);

      const buffer = Buffer.from(base64, "base64");
      const rows = parseExcelBuffer(buffer);
      assert.ok(rows.length >= 4);
      assert.equal(rows[0][0], "QuestionNumber");
      assert.equal(rows[0][1], "Prompt");
    });

    test("getMcqTemplateAction returns correct MIME type and base64 for admin", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const resXlsx = await getMcqTemplateAction("xlsx");
      assert.equal(resXlsx.success, true);
      assert.equal(resXlsx.filename, "mcq_bulk_import_template.xlsx");
      assert.ok(resXlsx.data);

      const resCsv = await getMcqTemplateAction("csv");
      assert.equal(resCsv.success, true);
      assert.equal(resCsv.filename, "mcq_bulk_import_template.csv");
    });
  });

  // ==========================================
  // 2. Parser & Validator Logic Tests
  // ==========================================
  describe("MCQ Parser & Validation Rules", () => {
    const existingContext = {
      existingQuestionNumbers: new Set([1]),
      existingPromptsNormalized: new Set(["existing task question one"]),
      maxExistingQuestionNumber: 1,
    };

    test("successfully validates correct rows with options and answers", () => {
      const rawRows = [
        ["QuestionNumber", "Prompt", "Points", "OptionA", "OptionB", "OptionC", "OptionD", "CorrectAnswer", "Explanation"],
        ["2", "What is the capital of Bangladesh?", "15", "Chittagong", "Dhaka", "Khulna", "Sylhet", "B", "Dhaka is capital"],
        ["3", "Which data structure uses LIFO order?", "10", "Queue", "Stack", "Array", "Linked List", "Stack", "LIFO is stack"],
      ];

      const res = validateMcqRows(rawRows, existingContext);
      assert.equal(res.success, true);
      assert.equal(res.totalRows, 2);
      assert.equal(res.validRowsCount, 2);
      assert.equal(res.invalidRowsCount, 0);

      assert.equal(res.rows[0].questionNumber, 2);
      assert.equal(res.rows[0].correctOptionKey, "B");
      assert.equal(res.rows[0].points, 15);

      // Second row matched by text "Stack" -> maps to "B"
      assert.equal(res.rows[1].questionNumber, 3);
      assert.equal(res.rows[1].correctOptionKey, "B");
    });

    test("detects collision with existing question number and prompt", () => {
      const rawRows = [
        ["QuestionNumber", "Prompt", "Points", "OptionA", "OptionB", "CorrectAnswer"],
        // Collision with existing Q# 1
        ["1", "Brand new question with colliding number", "10", "Yes", "No", "A"],
        // Collision with existing prompt
        ["4", "Existing Task Question One", "10", "Yes", "No", "A"],
      ];

      const res = validateMcqRows(rawRows, existingContext);
      assert.equal(res.validRowsCount, 0);
      assert.equal(res.invalidRowsCount, 2);

      assert.match(res.rows[0].errors[0], /already exists in this task\. Overwriting is not permitted/i);
      assert.match(res.rows[1].errors[0], /identical prompt already exists/i);
    });

    test("flags row errors for missing prompt, missing options, and invalid answer key", () => {
      const rawRows = [
        ["QuestionNumber", "Prompt", "Points", "OptionA", "OptionB", "CorrectAnswer"],
        // Too short prompt
        ["5", "A", "10", "Option 1", "Option 2", "A"],
        // Only one option
        ["6", "Valid question prompt text", "10", "Only One", "", "A"],
        // Correct answer does not match any option
        ["7", "Another question prompt text", "10", "Choice One", "Choice Two", "Z"],
      ];

      const res = validateMcqRows(rawRows, existingContext);
      assert.equal(res.validRowsCount, 0);
      assert.equal(res.invalidRowsCount, 3);

      assert.match(res.rows[0].errors[0], /at least 3 characters/i);
      assert.match(res.rows[1].errors[0], /at least two non-empty options/i);
      assert.match(res.rows[2].errors[0], /does not match any provided option/i);
    });

    test("detects missing critical columns as global error", () => {
      const brokenHeaders = [["RandomCol", "AnotherCol"], ["1", "2"]];
      const res = validateMcqRows(brokenHeaders, existingContext);
      assert.equal(res.success, false);
      assert.ok(res.globalErrors.length >= 2);
    });
  });

  // ==========================================
  // 3. Server Action Tests (Preview & Execute)
  // ==========================================
  describe("Server Actions: previewBulkMcqImportAction & executeBulkMcqImportAction", () => {
    test("rejects non-admin calling preview or execute", async () => {
      setTestSession({
        userId: testParticipantId,
        email: "mcq.participant@aciedge.edu",
        role: "PARTICIPANT",
        name: "MCQ Participant",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const resPreview = await previewBulkMcqImportAction({
        taskId: testTaskId,
        fileBase64: Buffer.from("test").toString("base64"),
        fileName: "test.csv",
      });
      assert.equal(resPreview.success, false);

      const resExec = await executeBulkMcqImportAction({
        taskId: testTaskId,
        rows: [],
      });
      assert.equal(resExec.success, false);
      assert.match(resExec.error || "", /unauthorized|forbidden/i);
    });

    test("previewBulkMcqImportAction parses valid CSV file content", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const csvContent = [
        "QuestionNumber,Prompt,Points,OptionA,OptionB,OptionC,OptionD,CorrectAnswer,Explanation,ScoringGuide",
        '10,"Which financial statement reports assets, liabilities, and equity?",15,"Income Statement","Balance Sheet","Cash Flow","Statement of Retained Earnings","B","Balance sheet reports financial position.","Award full 15 points for B."',
        '11,"What is standard gross margin formula?",10,"Revenue - COGS","Operating Income / Revenue","Net Income / Shares","Current Assets / Liabilities","A","Gross profit is revenue minus cost of goods sold.","10 points."',
      ].join("\n");

      const base64 = Buffer.from(csvContent, "utf-8").toString("base64");

      const previewRes = await previewBulkMcqImportAction({
        taskId: testTaskId,
        fileBase64: base64,
        fileName: "questions.csv",
      });

      assert.equal(previewRes.success, true);
      assert.equal(previewRes.totalRows, 2);
      assert.equal(previewRes.validRowsCount, 2);
      assert.equal(previewRes.invalidRowsCount, 0);
      assert.equal(previewRes.rows[0].questionNumber, 10);
      assert.equal(previewRes.rows[0].correctOptionKey, "B");
      assert.equal(previewRes.rows[1].questionNumber, 11);
      assert.equal(previewRes.rows[1].correctOptionKey, "A");
    });

    test("executeBulkMcqImportAction atomically imports questions, options, and answer keys", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const questionsToImport = [
        {
          questionNumber: 20,
          prompt: "What is the primary objective of market segmentation?",
          instructions: "Select one answer.",
          points: 15,
          options: [
            { optionKey: "A", text: "To eliminate all marketing costs" },
            { optionKey: "B", text: "To divide a diverse market into homogenous target groups" },
            { optionKey: "C", text: "To guarantee government tax exemptions" },
            { optionKey: "D", text: "To replace product quality testing" },
          ],
          correctOptionKey: "B",
          explanation: "Segmentation groups customers with common needs.",
          scoringGuide: "15 marks for option B.",
        },
        {
          questionNumber: 21,
          prompt: "Which ratio assesses short-term liquidity without inventory?",
          instructions: "Choose the strictest test.",
          points: 15,
          options: [
            { optionKey: "A", text: "Quick Ratio (Acid-Test)" },
            { optionKey: "B", text: "Debt-to-Equity Ratio" },
            { optionKey: "C", text: "Asset Turnover Ratio" },
            { optionKey: "D", text: "Return on Assets" },
          ],
          correctOptionKey: "A",
          explanation: "The quick ratio excludes less liquid inventory.",
          scoringGuide: "15 marks for option A.",
        },
      ];

      const execRes = await executeBulkMcqImportAction({
        taskId: testTaskId,
        rows: questionsToImport,
      });

      assert.equal(execRes.success, true);
      assert.equal(execRes.importedCount, 2);

      // Verify in DB
      const q20 = await prisma.question.findFirst({
        where: { taskId: testTaskId, questionNumber: 20 },
        include: { options: true, answerKey: true },
      });
      assert.ok(q20, "Question 20 should exist in DB");
      assert.equal(q20.points, 15);
      assert.equal(q20.options.length, 4);
      assert.equal(q20.answerKey?.correctOptionKey, "B");
      assert.equal(q20.answerKey?.scoringGuide, "15 marks for option B.");

      const q21 = await prisma.question.findFirst({
        where: { taskId: testTaskId, questionNumber: 21 },
        include: { options: true, answerKey: true },
      });
      assert.ok(q21, "Question 21 should exist in DB");
      assert.equal(q21.answerKey?.correctOptionKey, "A");

      // Verify task totalPoints updated: 10 (existing Q1) + 15 (Q20) + 15 (Q21) = 40
      const updatedTask = await prisma.task.findUnique({ where: { id: testTaskId } });
      assert.equal(updatedTask?.totalPoints, 40);

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: testAdminId,
          action: "BULK_IMPORT_MCQ",
          targetId: testTaskId,
        },
      });
      assert.ok(audit, "Audit log for bulk import should be recorded");
    });

    test("executeBulkMcqImportAction strictly prevents overwriting existing questions", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Attempt to overwrite Question 1
      const collidingInput = [
        {
          questionNumber: 1,
          prompt: "Trying to overwrite Question 1",
          points: 10,
          options: [
            { optionKey: "A", text: "One" },
            { optionKey: "B", text: "Two" },
          ],
          correctOptionKey: "A",
        },
      ];

      const res = await executeBulkMcqImportAction({
        taskId: testTaskId,
        rows: collidingInput,
      });

      assert.equal(res.success, false);
      assert.match(res.error || "", /already exists in this task\. Overwriting is not permitted/i);

      // Confirm Q1 prompt was NOT overwritten in DB
      const originalQ1 = await prisma.question.findFirst({
        where: { taskId: testTaskId, questionNumber: 1 },
      });
      assert.equal(originalQ1?.prompt, "Existing Task Question One");
    });

    test("successfully imports 1 MCQ with full relational consistency", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const singleMcq = [
        {
          questionNumber: 30,
          prompt: "What does SQL stand for?",
          points: 10,
          options: [
            { optionKey: "A", text: "Structured Question Language" },
            { optionKey: "B", text: "Structured Query Language" },
            { optionKey: "C", text: "Simple Query Language" },
            { optionKey: "D", text: "Sequential Query Logic" },
          ],
          correctOptionKey: "B",
          explanation: "SQL stands for Structured Query Language.",
        },
      ];

      const res = await executeBulkMcqImportAction({
        taskId: testTaskId,
        rows: singleMcq,
      });

      assert.equal(res.success, true);
      assert.equal(res.importedCount, 1);

      const q30 = await prisma.question.findFirst({
        where: { taskId: testTaskId, questionNumber: 30 },
        include: { options: true, answerKey: true },
      });
      assert.ok(q30);
      assert.equal(q30.options.length, 4);
      assert.equal(q30.answerKey?.correctOptionKey, "B");
    });

    test("successfully imports 10 MCQs in a fast single batch transaction", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const tenMcqs = Array.from({ length: 10 }, (_, idx) => ({
        questionNumber: 40 + idx,
        prompt: `Test 10 batch question prompt #${idx + 1}`,
        points: 5,
        options: [
          { optionKey: "A", text: `Choice A for ${idx}` },
          { optionKey: "B", text: `Choice B for ${idx}` },
          { optionKey: "C", text: `Choice C for ${idx}` },
          { optionKey: "D", text: `Choice D for ${idx}` },
        ],
        correctOptionKey: "C",
        explanation: `Explanation for Q#${idx + 1}`,
      }));

      const startTime = Date.now();
      const res = await executeBulkMcqImportAction({
        taskId: testTaskId,
        rows: tenMcqs,
      });
      const durationMs = Date.now() - startTime;

      assert.equal(res.success, true);
      assert.equal(res.importedCount, 10);
      // Confirmed fast batch execution
      assert.ok(durationMs < 5000, `10 MCQs took ${durationMs}ms, should be well under 5000ms`);

      const count = await prisma.question.count({
        where: { taskId: testTaskId, questionNumber: { gte: 40, lte: 49 } },
      });
      assert.equal(count, 10);
    });

    test("successfully imports 40 MCQs without transaction timeout", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const fortyMcqs = Array.from({ length: 40 }, (_, idx) => ({
        questionNumber: 100 + idx,
        prompt: `High-volume performance question prompt #${idx + 1}: How does batch createMany prevent transaction timeouts?`,
        instructions: `Guidance for performance test question #${idx + 1}`,
        points: 10,
        options: [
          { optionKey: "A", text: "By executing sequential queries in a loop" },
          { optionKey: "B", text: "By combining multi-row inserts into a single bulk statement" },
          { optionKey: "C", text: "By turning off database transactions" },
          { optionKey: "D", text: "By dropping table constraints" },
        ],
        correctOptionKey: "B",
        explanation: "Batch createMany reduces 120 round-trips to just 3 bulk SQL queries.",
        scoringGuide: "10 marks for option B.",
      }));

      const startTime = Date.now();
      const res = await executeBulkMcqImportAction({
        taskId: testTaskId,
        rows: fortyMcqs,
      });
      const durationMs = Date.now() - startTime;

      assert.equal(res.success, true);
      assert.equal(res.importedCount, 40);

      // Verify that 40 questions executed well under the 5000ms timeout!
      console.log(`[PERF] 40 MCQs imported in ${durationMs}ms`);
      assert.ok(durationMs < 5000, `40 MCQs took ${durationMs}ms, well under the previous 5000ms timeout`);

      // Verify all 40 questions exist in the database with their options and answer keys
      const questionsInDb = await prisma.question.findMany({
        where: { taskId: testTaskId, questionNumber: { gte: 100, lte: 139 } },
        include: { options: true, answerKey: true },
      });
      assert.equal(questionsInDb.length, 40);

      const allOptionsCount = questionsInDb.reduce((sum, q) => sum + q.options.length, 0);
      assert.equal(allOptionsCount, 40 * 4); // 160 options

      const allAnswerKeysCount = questionsInDb.filter((q) => q.answerKey?.correctOptionKey === "B").length;
      assert.equal(allAnswerKeysCount, 40);
    });

    test("database collision or failure cleanly rolls back the transaction with zero partial records", async () => {
      setTestSession({
        userId: testAdminId,
        email: "mcq.admin@aciedge.edu",
        role: "ADMIN",
        name: "MCQ Test Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Record count before the failed attempt
      const questionsBefore = await prisma.question.count({ where: { taskId: testTaskId } });
      const optionsBefore = await prisma.mcqOption.count({
        where: { question: { taskId: testTaskId } },
      });
      const keysBefore = await prisma.questionAnswerKey.count({
        where: { question: { taskId: testTaskId } },
      });

      // Prepare batch where the 5th item collides with an existing question number
      const batchWithCollision = [
        {
          questionNumber: 300,
          prompt: "Batch failure question 1",
          points: 10,
          options: [{ optionKey: "A", text: "A" }, { optionKey: "B", text: "B" }],
          correctOptionKey: "A",
        },
        {
          questionNumber: 301,
          prompt: "Batch failure question 2",
          points: 10,
          options: [{ optionKey: "A", text: "A" }, { optionKey: "B", text: "B" }],
          correctOptionKey: "A",
        },
        {
          // Collision: Question 1 already exists in this task!
          questionNumber: 1,
          prompt: "Batch failure question 3 colliding with Q1",
          points: 10,
          options: [{ optionKey: "A", text: "A" }, { optionKey: "B", text: "B" }],
          correctOptionKey: "A",
        },
      ];

      const res = await executeBulkMcqImportAction({
        taskId: testTaskId,
        rows: batchWithCollision,
      });

      // Must fail
      assert.equal(res.success, false);
      assert.match(res.error || "", /already exists in this task/i);

      // Verify that NEITHER question 300 nor 301 were committed!
      const q300 = await prisma.question.findFirst({
        where: { taskId: testTaskId, questionNumber: 300 },
      });
      assert.equal(q300, null, "Question 300 must not exist due to rollback");

      const q301 = await prisma.question.findFirst({
        where: { taskId: testTaskId, questionNumber: 301 },
      });
      assert.equal(q301, null, "Question 301 must not exist due to rollback");

      // Verify exact counts remained unchanged (zero partial records)
      const questionsAfter = await prisma.question.count({ where: { taskId: testTaskId } });
      const optionsAfter = await prisma.mcqOption.count({
        where: { question: { taskId: testTaskId } },
      });
      const keysAfter = await prisma.questionAnswerKey.count({
        where: { question: { taskId: testTaskId } },
      });

      assert.equal(questionsAfter, questionsBefore);
      assert.equal(optionsAfter, optionsBefore);
      assert.equal(keysAfter, keysBefore);
    });
  });
});

