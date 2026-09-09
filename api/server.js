const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
const { put } = require("@vercel/blob");

const app = express();

const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const BUILDER_API_SECRET = process.env.BUILDER_API_SECRET;
const PUBLIC_API_URL = process.env.PUBLIC_API_URL;

const jobs = new Map();

app.use(cors());

app.use(
  express.json({
    limit: "2mb"
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const extension = getExtension(file.originalname);

    const allowed = [".html", ".htm", ".zip"];

    if (!allowed.includes(extension)) {
      return cb(
        new Error("Only HTML, HTM and ZIP files are allowed.")
      );
    }

    cb(null, true);
  }
});

const apkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype &&
      file.mimetype !==
        "application/vnd.android.package-archive" &&
      !file.originalname.toLowerCase().endsWith(".apk")
    ) {
      return cb(new Error("Only APK files are allowed."));
    }

    cb(null, true);
  }
});

/*
============================================================
HEALTH CHECK
============================================================
*/

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "FOUR × SEVEN Builder API",
    version: "2.0.0"
  });
});

/*
============================================================
CREATE BUILD
============================================================
*/

app.post("/api/build", upload.single("project"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Project file is required."
      });
    }

    const appName = String(req.body.appName || "").trim();
    const packageName = String(req.body.packageName || "").trim();
    const projectType = String(
      req.body.projectType || "app"
    ).trim();

    if (!appName) {
      return res.status(400).json({
        error: "App name is required."
      });
    }

    if (!isValidPackage(packageName)) {
      return res.status(400).json({
        error:
          "Invalid Android package name. Example: com.fourseven.myapp"
      });
    }

    if (
      projectType !== "app" &&
      projectType !== "game"
    ) {
      return res.status(400).json({
        error: "Project type must be app or game."
      });
    }

    const jobId = crypto.randomUUID();

    const projectBlob = await put(
      `four-seven/projects/${jobId}/project${getExtension(
        req.file.originalname
      )}`,
      req.file.buffer,
      {
        access: "public",
        addRandomSuffix: false,
        contentType:
          req.file.mimetype || "application/octet-stream"
      }
    );

    const job = {
      jobId,
      appName,
      packageName,
      projectType,
      originalFilename: req.file.originalname,
      extension: getExtension(req.file.originalname),
      projectUrl: projectBlob.url,
      apkUrl: null,

      status: "queued",
      progress: 15,
      statusText: "Queued",
      message:
        "Waiting for the Android build runner.",
      log: "",

      createdAt: new Date().toISOString()
    };

    jobs.set(jobId, job);

    try {
      await triggerGithubBuild(job);
    } catch (error) {
      job.status = "failed";
      job.progress = 100;
      job.statusText = "Build Failed";
      job.message = error.message;
      job.error = error.message;

      jobs.set(jobId, job);

      return res.status(500).json({
        error: error.message
      });
    }

    res.json({
      ok: true,
      jobId,
      status: job.status
    });
  } catch (error) {
    console.error("CREATE BUILD ERROR:", error);

    res.status(500).json({
      error:
        error.message ||
        "Could not create build."
    });
  }
});

/*
============================================================
GET BUILD STATUS
============================================================
*/

app.get("/api/build/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error: "Build not found."
    });
  }

  const response = {
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    statusText: job.statusText,
    message: job.message,
    log: job.log || ""
  };

  if (
    job.status === "completed" &&
    job.apkUrl
  ) {
    response.downloadUrl = job.apkUrl;
  }

  if (job.status === "failed") {
    response.error =
      job.error ||
      job.message ||
      "Build failed.";
  }

  res.json(response);
});

/*
============================================================
DOWNLOAD APK
============================================================
*/

app.get("/api/download/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).send(
      "Build not found."
    );
  }

  if (job.status !== "completed") {
    return res.status(400).send(
      "APK is not ready."
    );
  }

  if (!job.apkUrl) {
    return res.status(404).send(
      "APK file not found."
    );
  }

  res.redirect(job.apkUrl);
});

/*
============================================================
INTERNAL: DOWNLOAD PROJECT FOR GITHUB ACTIONS
============================================================
*/

app.get(
  "/api/internal/project/:jobId",
  requireSecret,
  async (req, res) => {
    try {
      const job = jobs.get(
        req.params.jobId
      );

      if (!job) {
        return res.status(404).send(
          "Job not found."
        );
      }

      if (!job.projectUrl) {
        return res.status(404).send(
          "Project file not found."
        );
      }

      res.redirect(job.projectUrl);
    } catch (error) {
      console.error(
        "PROJECT DOWNLOAD ERROR:",
        error
      );

      res.status(500).send(
        "Could not retrieve project."
      );
    }
  }
);

/*
============================================================
INTERNAL: UPDATE BUILD PROGRESS
============================================================
*/

app.post(
  "/api/internal/progress/:jobId",
  requireSecret,
  (req, res) => {
    const job = jobs.get(
      req.params.jobId
    );

    if (!job) {
      return res.status(404).json({
        error: "Job not found."
      });
    }

    const progress = Number(
      req.body.progress
    );

    if (Number.isFinite(progress)) {
      job.progress = Math.max(
        0,
        Math.min(99, progress)
      );
    }

    if (req.body.statusText) {
      job.statusText = String(
        req.body.statusText
      );
    }

    if (req.body.message) {
      job.message = String(
        req.body.message
      );
    }

    if (req.body.log) {
      job.log = String(
        req.body.log
      );
    }

    job.status = "building";

    jobs.set(job.jobId, job);

    res.json({
      ok: true
    });
  }
);

/*
============================================================
INTERNAL: APK COMPLETE
============================================================
*/

app.post(
  "/api/internal/complete/:jobId",
  requireSecret,
  apkUpload.single("apk"),
  async (req, res) => {
    try {
      const job = jobs.get(
        req.params.jobId
      );

      if (!job) {
        return res.status(404).json({
          error: "Job not found."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "APK file is required."
        });
      }

      const safeName =
        sanitizeFilename(job.appName);

      const apkBlob = await put(
        `four-seven/apks/${job.jobId}/${safeName}.apk`,
        req.file.buffer,
        {
          access: "public",
          addRandomSuffix: false,
          contentType:
            "application/vnd.android.package-archive"
        }
      );

      job.apkUrl = apkBlob.url;
      job.status = "completed";
      job.progress = 100;
      job.statusText = "APK Ready";
      job.message =
        "Your APK is ready to download.";

      job.log =
        (job.log || "") +
        "\nAPK uploaded successfully.";

      jobs.set(job.jobId, job);

      res.json({
        ok: true,
        apkUrl: apkBlob.url
      });
    } catch (error) {
      console.error(
        "APK UPLOAD ERROR:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Could not store APK."
      });
    }
  }
);

/*
============================================================
INTERNAL: BUILD FAILED
============================================================
*/

app.post(
  "/api/internal/fail/:jobId",
  requireSecret,
  (req, res) => {
    const job = jobs.get(
      req.params.jobId
    );

    if (!job) {
      return res.status(404).json({
        error: "Job not found."
      });
    }

    job.status = "failed";
    job.progress = 100;
    job.statusText = "Build Failed";

    job.message = String(
      req.body.message ||
        "The Android build failed."
    );

    job.error = String(
      req.body.error ||
        job.message
    );

    if (req.body.log) {
      job.log = String(
        req.body.log
      );
    }

    jobs.set(job.jobId, job);

    res.json({
      ok: true
    });
  }
);

/*
============================================================
GITHUB ACTIONS TRIGGER
============================================================
*/

async function triggerGithubBuild(job) {
  if (
    !GITHUB_TOKEN ||
    !GITHUB_OWNER ||
    !GITHUB_REPO
  ) {
    throw new Error(
      "GitHub environment variables are missing."
    );
  }

  if (!BUILDER_API_SECRET) {
    throw new Error(
      "BUILDER_API_SECRET is missing."
    );
  }

  if (!PUBLIC_API_URL) {
    throw new Error(
      "PUBLIC_API_URL is missing."
    );
  }

  const apiBaseUrl =
    PUBLIC_API_URL.replace(
      /\/+$/,
      ""
    );

  const url =
    `https://api.github.com/repos/` +
    `${GITHUB_OWNER}/` +
    `${GITHUB_REPO}/dispatches`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Accept:
        "application/vnd.github+json",
      Authorization:
        `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version":
        "2022-11-28",
      "Content-Type":
        "application/json"
    },

    body: JSON.stringify({
      event_type:
        "four-seven-build",

      client_payload: {
        jobId: job.jobId,
        appName: job.appName,
        packageName:
          job.packageName,
        projectType:
          job.projectType,
        apiBaseUrl
      }
    })
  });

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `GitHub dispatch failed: ${response.status} ${body}`
    );
  }
}

/*
============================================================
SECURITY
============================================================
*/

function requireSecret(
  req,
  res,
  next
) {
  const supplied =
    req.headers[
      "x-builder-secret"
    ];

  if (
    !BUILDER_API_SECRET ||
    supplied !==
      BUILDER_API_SECRET
  ) {
    return res.status(401).json({
      error: "Unauthorized."
    });
  }

  next();
}

/*
============================================================
VALIDATION HELPERS
============================================================
*/

function isValidPackage(value) {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(
    value
  );
}

function getExtension(filename) {
  const match =
    String(filename)
      .toLowerCase()
      .match(/\.[^.]+$/);

  return match ? match[0] : "";
}

function sanitizeFilename(value) {
  return String(value)
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 50) || "app";
}

/*
============================================================
ERROR HANDLER
============================================================
*/

app.use(
  (error, req, res, next) => {
    console.error(
      "API ERROR:",
      error
    );

    res.status(400).json({
      error:
        error.message ||
        "Request failed."
    });
  }
);

/*
============================================================
LOCAL SERVER
============================================================
*/

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `FOUR × SEVEN Builder API running on port ${PORT}`
    );
  });
}

module.exports = app;