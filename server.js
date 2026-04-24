require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const AUTH_COOKIE_NAME = "clody_auth";
const AUTH_COOKIE_VALUE = "ok";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "adminclody";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "adminclody";
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
  },
});

app.use(express.json());

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, item) => {
    const [rawKey, ...rawValue] = item.trim().split("=");
    if (!rawKey) {
      return acc;
    }
    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[AUTH_COOKIE_NAME] === AUTH_COOKIE_VALUE;
}

app.get("/login", (req, res) => {
  if (isAuthenticated(req)) {
    return res.redirect("/");
  }
  return res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${AUTH_COOKIE_VALUE}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`,
  );
  return res.json({ message: "로그인 성공" });
});

app.post("/api/auth/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
  );
  return res.json({ message: "로그아웃 완료" });
});

app.use((req, res, next) => {
  if (req.path === "/login" || req.path === "/api/auth/login") {
    return next();
  }

  if (isAuthenticated(req)) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ message: "로그인이 필요합니다." });
  }

  return res.redirect("/login");
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/users/by-email", async (req, res) => {
  const email = String(req.query.email || "").trim();

  if (!email) {
    return res.status(400).json({ message: "email 쿼리가 필요합니다." });
  }

  try {
    const result = await pool.query(
      "SELECT email, nick_name FROM users WHERE email = $1 LIMIT 1",
      [email],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "해당 이메일 사용자가 없습니다." });
    }

    return res.json({
      email: result.rows[0].email,
      nickName: result.rows[0].nick_name,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "DB 조회 중 오류가 발생했습니다." });
  }
});

app.get("/api/diaries/calendar", async (req, res) => {
  const email = String(req.query.email || "").trim();
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!email) {
    return res.status(400).json({ message: "email 쿼리가 필요합니다." });
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res
      .status(400)
      .json({ message: "year/month 쿼리는 올바른 정수여야 합니다." });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        EXTRACT(DAY FROM timezone('Asia/Seoul', d.created_at))::int AS day,
        d.id,
        d.content
      FROM diaries d
      JOIN users u ON u.id = d.user_id
      WHERE u.email = $1
        AND d.is_deleted = false
        AND EXTRACT(YEAR FROM timezone('Asia/Seoul', d.created_at))::int = $2
        AND EXTRACT(MONTH FROM timezone('Asia/Seoul', d.created_at))::int = $3
      ORDER BY d.created_at ASC
      `,
      [email, year, month],
    );

    const byDay = {};
    result.rows.forEach((row) => {
      if (!byDay[row.day]) {
        byDay[row.day] = {
          count: 0,
          diaries: [],
        };
      }
      byDay[row.day].count += 1;
      byDay[row.day].diaries.push({
        id: row.id,
        content: row.content,
      });
    });

    return res.json({ byDay });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "캘린더 일기 조회 중 오류가 발생했습니다." });
  }
});

app.post("/api/drafts/by-email", async (req, res) => {
  const email = String(req.body.email || "").trim();
  const selectedDate = String(req.body.selectedDate || "").trim();
  const contents = Array.isArray(req.body.contents) ? req.body.contents : [];
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!email) {
    return res.status(400).json({ message: "email 값이 필요합니다." });
  }

  if (!datePattern.test(selectedDate)) {
    return res
      .status(400)
      .json({ message: "선택된 날짜 형식이 올바르지 않습니다." });
  }

  const normalizedContents = contents
    .map((content) => String(content || "").trim())
    .filter((content) => content.length > 0);

  if (normalizedContents.length === 0) {
    return res.status(400).json({ message: "임시저장할 내용을 입력해주세요." });
  }

  if (normalizedContents.length > 5) {
    return res
      .status(400)
      .json({ message: "임시저장은 최대 5개까지 가능합니다." });
  }

  const invalidContent = normalizedContents.find(
    (content) => content.length < 2 || content.length >= 50,
  );
  if (invalidContent !== undefined) {
    return res
      .status(400)
      .json({ message: "각 임시저장 일기는 2자 이상 50자 미만이어야 합니다." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email],
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "해당 이메일 사용자가 없습니다." });
    }

    const userId = userResult.rows[0].id;
    const existingDraftCountResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM drafts d
      WHERE d.user_id = $1
        AND d.date = $2::date
      `,
      [userId, selectedDate],
    );

    const existingDraftCount = existingDraftCountResult.rows[0].count;
    if (existingDraftCount + normalizedContents.length > 5) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: `해당 날짜 임시저장은 최대 5개입니다. 현재 ${existingDraftCount}개가 있어 ${5 - existingDraftCount}개까지만 추가할 수 있습니다.`,
      });
    }

    const deleteDiariesResult = await client.query(
      `
      UPDATE diaries d
      SET
        is_deleted = true,
        updated_at = NOW()
      WHERE d.user_id = $1
        AND d.is_deleted = false
        AND DATE(timezone('Asia/Seoul', d.created_at)) = $2::date
      `,
      [userId, selectedDate],
    );

    const deleteRepliesResult = await client.query(
      `
      DELETE FROM replies r
      WHERE r.user_id = $1
        AND DATE(timezone('Asia/Seoul', r.diary_created_date)) = $2::date
      `,
      [userId, selectedDate],
    );

    const values = [];
    const params = [];
    normalizedContents.forEach((content, index) => {
      const offset = index * 3;
      values.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}::date, NOW(), NOW())`,
      );
      params.push(content, userId, selectedDate);
    });

    await client.query(
      `
      INSERT INTO drafts (
        content,
        user_id,
        date,
        created_at,
        updated_at
      )
      VALUES ${values.join(", ")}
      `,
      params,
    );

    await client.query("COMMIT");
    return res.json({
      message: `임시저장 ${normalizedContents.length}개가 완료되었습니다.`,
      insertedCount: normalizedContents.length,
      totalDraftCount: existingDraftCount + normalizedContents.length,
      deletedDiaryCount: deleteDiariesResult.rowCount || 0,
      deletedRepliesCount: deleteRepliesResult.rowCount || 0,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error(error);
    return res.status(500).json({ message: "임시저장 중 오류가 발생했습니다." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.get("/api/drafts/by-email", async (req, res) => {
  const email = String(req.query.email || "").trim();
  const selectedDate = String(req.query.selectedDate || "").trim();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!email) {
    return res.status(400).json({ message: "email 쿼리가 필요합니다." });
  }

  if (!datePattern.test(selectedDate)) {
    return res
      .status(400)
      .json({ message: "선택된 날짜 형식이 올바르지 않습니다." });
  }

  try {
    const result = await pool.query(
      `
      SELECT d.id, d.content
      FROM drafts d
      JOIN users u ON u.id = d.user_id
      WHERE u.email = $1
        AND d.date = $2::date
      ORDER BY d.created_at ASC
      `,
      [email, selectedDate],
    );

    return res.json({
      drafts: result.rows.map((row) => ({
        id: row.id,
        content: row.content,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "임시저장 조회 중 오류가 발생했습니다." });
  }
});

app.get("/api/drafts/calendar", async (req, res) => {
  const email = String(req.query.email || "").trim();
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!email) {
    return res.status(400).json({ message: "email 쿼리가 필요합니다." });
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res
      .status(400)
      .json({ message: "year/month 쿼리는 올바른 정수여야 합니다." });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        EXTRACT(DAY FROM d.date)::int AS day,
        COUNT(*)::int AS count
      FROM drafts d
      JOIN users u ON u.id = d.user_id
      WHERE u.email = $1
        AND EXTRACT(YEAR FROM d.date)::int = $2
        AND EXTRACT(MONTH FROM d.date)::int = $3
      GROUP BY EXTRACT(DAY FROM d.date)::int
      `,
      [email, year, month],
    );

    const byDay = {};
    result.rows.forEach((row) => {
      byDay[row.day] = { count: row.count };
    });

    return res.json({ byDay });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "캘린더 임시저장 조회 중 오류가 발생했습니다." });
  }
});

app.get("/api/replies/calendar", async (req, res) => {
  const email = String(req.query.email || "").trim();
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!email) {
    return res.status(400).json({ message: "email 쿼리가 필요합니다." });
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res
      .status(400)
      .json({ message: "year/month 쿼리는 올바른 정수여야 합니다." });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        day_count.day,
        day_count.count,
        latest.reply_process_status,
        latest.is_read
      FROM (
        SELECT
          EXTRACT(DAY FROM timezone('Asia/Seoul', r.diary_created_date))::int AS day,
          COUNT(*)::int AS count
        FROM replies r
        JOIN users u ON u.id = r.user_id
        WHERE u.email = $1
          AND EXTRACT(YEAR FROM timezone('Asia/Seoul', r.diary_created_date))::int = $2
          AND EXTRACT(MONTH FROM timezone('Asia/Seoul', r.diary_created_date))::int = $3
        GROUP BY EXTRACT(DAY FROM timezone('Asia/Seoul', r.diary_created_date))::int
      ) day_count
      JOIN LATERAL (
        SELECT r.reply_process_status, r.is_read
        FROM replies r
        JOIN users u ON u.id = r.user_id
        WHERE u.email = $1
          AND EXTRACT(YEAR FROM timezone('Asia/Seoul', r.diary_created_date))::int = $2
          AND EXTRACT(MONTH FROM timezone('Asia/Seoul', r.diary_created_date))::int = $3
          AND EXTRACT(DAY FROM timezone('Asia/Seoul', r.diary_created_date))::int = day_count.day
        ORDER BY r.updated_at DESC, r.id DESC
        LIMIT 1
      ) latest ON true
      `,
      [email, year, month],
    );

    const byDay = {};
    result.rows.forEach((row) => {
      byDay[row.day] = {
        count: row.count,
        status: row.reply_process_status,
        isRead: row.is_read,
      };
    });

    return res.json({ byDay });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "캘린더 답장 조회 중 오류가 발생했습니다." });
  }
});

app.delete("/api/drafts/:draftId", async (req, res) => {
  const draftId = Number(req.params.draftId);
  const email = String(req.body.email || "").trim();

  if (!Number.isInteger(draftId) || draftId <= 0) {
    return res.status(400).json({ message: "올바른 draft id가 필요합니다." });
  }

  if (!email) {
    return res.status(400).json({ message: "email 값이 필요합니다." });
  }

  try {
    const result = await pool.query(
      `
      DELETE FROM drafts d
      USING users u
      WHERE d.id = $1
        AND u.email = $2
        AND d.user_id = u.id
      RETURNING d.id
      `,
      [draftId, email],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "삭제할 임시저장을 찾을 수 없습니다." });
    }

    return res.json({ message: "임시저장을 삭제했습니다." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "임시저장 삭제 중 오류가 발생했습니다." });
  }
});

app.post("/api/clean/by-email", async (req, res) => {
  const email = String(req.body.email || "").trim();
  const selectedDate = String(req.body.selectedDate || "").trim();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!email) {
    return res.status(400).json({ message: "email 값이 필요합니다." });
  }

  if (!datePattern.test(selectedDate)) {
    return res
      .status(400)
      .json({ message: "선택된 날짜 형식이 올바르지 않습니다." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email],
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "해당 이메일 사용자가 없습니다." });
    }

    const userId = userResult.rows[0].id;

    const deleteRepliesResult = await client.query(
      `
      DELETE FROM replies r
      WHERE r.user_id = $1
        AND DATE(timezone('Asia/Seoul', r.diary_created_date)) = $2::date
      `,
      [userId, selectedDate],
    );

    const deleteDiariesResult = await client.query(
      `
      DELETE FROM diaries d
      WHERE d.user_id = $1
        AND DATE(timezone('Asia/Seoul', d.created_at)) = $2::date
      `,
      [userId, selectedDate],
    );

    const deleteDraftsResult = await client.query(
      `
      DELETE FROM drafts d
      WHERE d.user_id = $1
        AND d.date = $2::date
      `,
      [userId, selectedDate],
    );

    await client.query("COMMIT");

    return res.json({
      message: "해당 날짜 데이터가 모두 클린되었습니다.",
      deletedDiariesCount: deleteDiariesResult.rowCount || 0,
      deletedRepliesCount: deleteRepliesResult.rowCount || 0,
      deletedDraftsCount: deleteDraftsResult.rowCount || 0,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error(error);
    return res.status(500).json({ message: "클린 처리 중 오류가 발생했습니다." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.delete("/api/diaries/:diaryId", async (req, res) => {
  const diaryId = Number(req.params.diaryId);
  const email = String(req.body.email || "").trim();

  if (!Number.isInteger(diaryId) || diaryId <= 0) {
    return res.status(400).json({ message: "올바른 diary id가 필요합니다." });
  }

  if (!email) {
    return res.status(400).json({ message: "email 값이 필요합니다." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `
      UPDATE diaries d
      SET
        is_deleted = true,
        updated_at = NOW()
      FROM users u
      WHERE d.id = $1
        AND u.email = $2
        AND d.user_id = u.id
        AND d.is_deleted = false
      RETURNING d.id, d.user_id, d.created_at
      `,
      [diaryId, email],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "삭제할 일기를 찾을 수 없습니다." });
    }

    const deletedDiary = result.rows[0];
    const remainingDiariesResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM diaries d
      WHERE d.user_id = $1
        AND d.is_deleted = false
        AND DATE(timezone('Asia/Seoul', d.created_at)) =
            DATE(timezone('Asia/Seoul', $2::timestamptz))
      `,
      [deletedDiary.user_id, deletedDiary.created_at],
    );

    let deletedRepliesCount = 0;
    if (remainingDiariesResult.rows[0].count === 0) {
      const deleteRepliesResult = await client.query(
        `
        DELETE FROM replies r
        WHERE r.user_id = $1
          AND DATE(timezone('Asia/Seoul', r.diary_created_date)) =
              DATE(timezone('Asia/Seoul', $2::timestamptz))
        `,
        [deletedDiary.user_id, deletedDiary.created_at],
      );
      deletedRepliesCount = deleteRepliesResult.rowCount || 0;
    }

    await client.query("COMMIT");
    return res.json({
      message: "일기가 삭제되었습니다.",
      deletedRepliesCount,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error(error);
    return res.status(500).json({ message: "일기 삭제 중 오류가 발생했습니다." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.get("/api/replies/by-diary", async (req, res) => {
  const diaryId = Number(req.query.diaryId);
  const email = String(req.query.email || "").trim();

  if (!Number.isInteger(diaryId) || diaryId <= 0) {
    return res.status(400).json({ message: "올바른 diary id가 필요합니다." });
  }

  if (!email) {
    return res.status(400).json({ message: "email 쿼리가 필요합니다." });
  }

  try {
    const diaryResult = await pool.query(
      `
      SELECT d.created_at, d.user_id
      FROM diaries d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = $1
        AND u.email = $2
        AND d.is_deleted = false
      LIMIT 1
      `,
      [diaryId, email],
    );

    if (diaryResult.rows.length === 0) {
      return res.json({ reply: null });
    }

    const diary = diaryResult.rows[0];
    const result = await pool.query(
      `
      SELECT
        r.id,
        r.reply_process_status,
        r.is_read,
        r.content,
        r.reply_type
      FROM replies r
      WHERE r.user_id = $1
        AND DATE(timezone('Asia/Seoul', r.diary_created_date)) =
            DATE(timezone('Asia/Seoul', $2::timestamptz))
      ORDER BY r.updated_at DESC, r.id DESC
      LIMIT 1
      `,
      [diary.user_id, diary.created_at],
    );

    if (result.rows.length === 0) {
      return res.json({ reply: null });
    }

    return res.json({
      reply: {
        id: result.rows[0].id,
        diaryId,
        replyProcessStatus: result.rows[0].reply_process_status,
        isRead: result.rows[0].is_read,
        content: result.rows[0].content,
        replyType: result.rows[0].reply_type,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "답장 조회 중 오류가 발생했습니다." });
  }
});

app.post("/api/replies", async (req, res) => {
  const diaryId = Number(req.body.diaryId);
  const email = String(req.body.email || "").trim();
  const rawReplyType = String(req.body.replyType || "FIRST").trim().toUpperCase();
  const allowedReplyTypes = ["FIRST", "DYNAMIC", "DYANAMIC"];
  const replyType = rawReplyType === "DYANAMIC" ? "DYNAMIC" : rawReplyType;

  if (!Number.isInteger(diaryId) || diaryId <= 0) {
    return res.status(400).json({ message: "올바른 diary id가 필요합니다." });
  }

  if (!email) {
    return res.status(400).json({ message: "email 값이 필요합니다." });
  }

  if (!allowedReplyTypes.includes(replyType)) {
    return res
      .status(400)
      .json({ message: "reply_type은 FIRST 또는 DYNAMIC 이어야 합니다." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const diaryResult = await client.query(
      `
      SELECT d.id, d.user_id, d.created_at
      FROM diaries d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = $1
        AND u.email = $2
        AND d.is_deleted = false
      LIMIT 1
      `,
      [diaryId, email],
    );

    if (diaryResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "일기를 찾을 수 없습니다." });
    }

    const diary = diaryResult.rows[0];
    const dailyReplyExistsResult = await client.query(
      `
      SELECT 1
      FROM replies r
      WHERE r.user_id = $1
        AND DATE(timezone('Asia/Seoul', r.diary_created_date)) =
            DATE(timezone('Asia/Seoul', $2::timestamptz))
      LIMIT 1
      `,
      [diary.user_id, diary.created_at],
    );

    if (dailyReplyExistsResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "같은 날짜의 일기들에 대해서는 답장을 1개만 생성할 수 있습니다.",
      });
    }

    const insertResult = await client.query(
      `
      INSERT INTO replies (
        diary_created_date,
        is_read,
        version,
        user_id,
        content,
        reply_process_status,
        reply_type,
        is_from_ad,
        supported_language,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        false,
        0,
        $2,
        NULL,
        'PENDING',
        $3,
        false,
        'KO',
        NOW(),
        NOW()
      )
      RETURNING id
      `,
      [diary.created_at, diary.user_id, replyType],
    );

    await client.query("COMMIT");
    return res.json({ replyId: insertResult.rows[0].id });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error(error);
    return res.status(500).json({ message: "답장 생성 중 오류가 발생했습니다." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.patch("/api/replies/:replyId", async (req, res) => {
  const replyId = Number(req.params.replyId);
  const email = String(req.body.email || "").trim();
  const replyProcessStatus = String(req.body.replyProcessStatus || "")
    .trim()
    .toUpperCase();
  const allowedStatuses = ["PENDING", "SUCCEED"];

  if (!Number.isInteger(replyId) || replyId <= 0) {
    return res.status(400).json({ message: "올바른 reply id가 필요합니다." });
  }

  if (!email) {
    return res.status(400).json({ message: "email 값이 필요합니다." });
  }

  if (!allowedStatuses.includes(replyProcessStatus)) {
    return res
      .status(400)
      .json({ message: "reply_process_status는 PENDING 또는 SUCCEED 이어야 합니다." });
  }

  const rawReplyType = String(req.body.replyType || "FIRST").trim().toUpperCase();
  const allowedReplyTypes = ["FIRST", "DYNAMIC", "DYANAMIC"];
  const replyType = rawReplyType === "DYANAMIC" ? "DYNAMIC" : rawReplyType;
  if (!allowedReplyTypes.includes(replyType)) {
    return res
      .status(400)
      .json({ message: "reply_type은 FIRST 또는 DYNAMIC 이어야 합니다." });
  }

  const contentInput = req.body.content;
  const content =
    contentInput === undefined || contentInput === null
      ? null
      : String(contentInput).trim();

  const isReadInput = req.body.isRead;
  const isRead =
    replyProcessStatus === "SUCCEED"
      ? Boolean(isReadInput)
      : false;

  try {
    const result = await pool.query(
      `
      UPDATE replies r
      SET
        reply_process_status = $1,
        is_read = $2,
        content = $3,
        reply_type = $4,
        updated_at = NOW()
      FROM users u
      WHERE r.id = $5
        AND r.user_id = u.id
        AND u.email = $6
      RETURNING r.id
      `,
      [
        replyProcessStatus,
        isRead,
        replyProcessStatus === "PENDING" ? null : content,
        replyType,
        replyId,
        email,
      ],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "수정할 답장을 찾을 수 없습니다." });
    }

    return res.json({ message: "답장 상태가 변경되었습니다." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "답장 수정 중 오류가 발생했습니다." });
  }
});

app.post("/api/diaries/by-email", async (req, res) => {
  const email = String(req.body.email || "").trim();
  const contents = Array.isArray(req.body.contents) ? req.body.contents : [];
  const selectedDate = String(req.body.selectedDate || "").trim();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!email) {
    return res.status(400).json({ message: "email 값이 필요합니다." });
  }

  if (!selectedDate) {
    return res.status(400).json({ message: "선택된 날짜가 필요합니다." });
  }

  if (!datePattern.test(selectedDate)) {
    return res
      .status(400)
      .json({ message: "선택된 날짜 형식이 올바르지 않습니다." });
  }

  if (contents.length < 1 || contents.length > 5) {
    return res
      .status(400)
      .json({ message: "일기는 1개 이상 5개 이하로 입력해야 합니다." });
  }

  const normalizedContents = contents.map((content) =>
    String(content || "").trim(),
  );
  const invalidContent = normalizedContents.find(
    (content) => content.length < 2 || content.length >= 50,
  );

  if (invalidContent !== undefined) {
    return res
      .status(400)
      .json({ message: "각 일기는 2자 이상 50자 미만이어야 합니다." });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [email],
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "해당 이메일 사용자가 없습니다." });
    }

    const userId = userResult.rows[0].id;
    const existingDiaryCountResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM diaries d
      WHERE d.user_id = $1
        AND d.is_deleted = false
        AND DATE(timezone('Asia/Seoul', d.created_at)) = $2::date
      `,
      [userId, selectedDate],
    );

    const existingDiaryCount = existingDiaryCountResult.rows[0].count;
    if (existingDiaryCount + normalizedContents.length > 5) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: `해당 날짜 일기는 최대 5개입니다. 현재 ${existingDiaryCount}개가 있어 ${5 - existingDiaryCount}개까지만 추가할 수 있습니다.`,
      });
    }

    const values = [];
    const params = [];
    const selectedDateTime = `${selectedDate} 20:00:00`;

    normalizedContents.forEach((content, index) => {
      const offset = index * 8;
      values.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${
          offset + 5
        }, $${offset + 6}, ($${offset + 7}::timestamp AT TIME ZONE 'Asia/Seoul'), ($${
          offset + 8
        }::timestamp AT TIME ZONE 'Asia/Seoul'))`,
      );
      params.push(
        false,
        false,
        userId,
        content,
        false,
        "Asia/Seoul",
        selectedDateTime,
        selectedDateTime,
      );
    });

    const insertQuery = `
      INSERT INTO diaries (
        contains_profanity,
        is_deleted,
        user_id,
        content,
        from_draft,
        timezone,
        created_at,
        updated_at
      )
      VALUES ${values.join(", ")}
      RETURNING id, content
    `;

    const insertResult = await client.query(insertQuery, params);

    const deleteDraftsResult = await client.query(
      `
      DELETE FROM drafts d
      WHERE d.user_id = $1
        AND d.date = $2::date
      `,
      [userId, selectedDate],
    );

    await client.query("COMMIT");

    return res.json({
      message: `${insertResult.rows.length}개의 일기가 저장되었습니다.`,
      selectedDate,
      insertedCount: insertResult.rows.length,
      deletedDraftCount: deleteDraftsResult.rowCount || 0,
      diaries: insertResult.rows,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error(error);
    return res
      .status(500)
      .json({ message: "일기 저장 중 오류가 발생했습니다." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(`DiaryMock server running on http://${HOST}:${PORT}`);
});
