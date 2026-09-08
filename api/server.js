const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const BUILDER_API_SECRET = process.env.BUILDER_API_SECRET;
const PUBLIC_API_URL = process.env.PUBLIC_API_URL;

/*
|--------------------------------------------------------------------------

Directories
*/

const DATA_DIR = path.join(__dirname, "jobs");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const APK_DIR = path.join(DATA_DIR, "apks");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(APK_DIR, { recursive: true });

/*
|--------------------------------------------------------------------------

Middleware
*/

app.use(cors());

app.use(express.json({
limit: "2mb"
}));

/*
|--------------------------------------------------------------------------

Upload
*/

const storage = multer.diskStorage({

destination: (req, file, cb) => {
cb(null, UPLOAD_DIR);
},

filename: (req, file, cb) => {

const id = crypto.randomUUID();

const extension =
  path.extname(file.originalname).toLowerCase();

cb(
  null,
  `${id}${extension}`
);

}

});

const upload = multer({

storage,

limits: {
fileSize: 25 * 1024 * 1024
},

fileFilter: (req, file, cb) => {

const extension =
  path.extname(file.originalname).toLowerCase();

const allowed = [
  ".html",
  ".htm",
  ".zip"
];

if (!allowed.includes(extension)) {

  return cb(
    new Error(
      "Only HTML, HTM and ZIP files are allowed."
    )
  );

}

cb(null, true);

}

});

/*
|--------------------------------------------------------------------------

Health check
*/

app.get(
"/api/health",
(req, res) => {

res.json({
  ok: true,
  service: "FOUR × SEVEN Builder API"
});

}
);

/*
|--------------------------------------------------------------------------

Create build
*/

app.post(
"/api/build",
upload.single("project"),
async (req, res) => {

try {

  if (!req.file) {

    return res.status(400).json({
      error: "Project file is required."
    });

  }


  const appName =
    String(
      req.body.appName || ""
    ).trim();


  const packageName =
    String(
      req.body.packageName || ""
    ).trim();


  const projectType =
    String(
      req.body.projectType || "app"
    );


  if (!appName) {

    removeFile(req.file.path);

    return res.status(400).json({
      error: "App name is required."
    });

  }


  if (!isValidPackage(packageName)) {

    removeFile(req.file.path);

    return res.status(400).json({
      error: "Invalid Android package name."
    });

  }


  const jobId =
    crypto.randomUUID();


  const jobDirectory =
    path.join(
      DATA_DIR,
      jobId
    );


  fs.mkdirSync(
    jobDirectory,
    {
      recursive: true
    }
  );


  const extension =
    path.extname(
      req.file.originalname
    ).toLowerCase();


  const projectPath =
    path.join(
      jobDirectory,
      `project${extension}`
    );


  fs.renameSync(
    req.file.path,
    projectPath
  );


  const job = {

    jobId,

    appName,

    packageName,

    projectType,

    originalFilename:
      req.file.originalname,

    extension,

    projectPath,

    apkPath: null,

    status: "queued",

    progress: 15,

    statusText: "Queued",

    message:
      "Waiting for the Android build runner.",

    log: "",

    createdAt:
      new Date().toISOString()

  };


  saveJob(job);


  try {

    await triggerGithubBuild(job);

  } catch (githubError) {

    job.status = "failed";

    job.progress = 100;

    job.statusText = "Build Failed";

    job.message =
      githubError.message;

    job.error =
      githubError.message;

    saveJob(job);

    return res.status(500).json({
      error:
        githubError.message
    });

  }


  res.json({

    ok: true,

    jobId,

    status: job.status

  });

} catch (error) {

  console.error(error);

  if (req.file) {
    removeFile(req.file.path);
  }

  res.status(500).json({

    error:
      error.message ||
      "Could not create build."

  });

}

}
);

/*
|--------------------------------------------------------------------------

Build status
*/

app.get(
"/api/build/:jobId",
(req, res) => {

const job =
  loadJob(
    req.params.jobId
  );


if (!job) {

  return res.status(404).json({
    error: "Build not found."
  });

}


const response = {

  jobId:
    job.jobId,

  status:
    job.status,

  progress:
    job.progress,

  statusText:
    job.statusText,

  message:
    job.message,

  log:
    job.log || ""

};


if (
  job.status === "completed"
) {

  response.downloadUrl =
    `/api/download/${encodeURIComponent(
      job.jobId
    )}`;

}


if (
  job.status === "failed"
) {

  response.error =
    job.error ||
    job.message ||
    "Build failed.";

}


res.json(response);

}
);

/*
|--------------------------------------------------------------------------

Download APK
*/

app.get(
"/api/download/:jobId",
(req, res) => {

const job =
  loadJob(
    req.params.jobId
  );


if (!job) {

  return res.status(404).send(
    "Build not found."
  );

}


if (
  job.status !== "completed"
) {

  return res.status(400).send(
    "APK is not ready."
  );

}


if (
  !job.apkPath ||
  !fs.existsSync(job.apkPath)
) {

  return res.status(404).send(
    "APK file not found."
  );

}


const safeName =
  sanitizeFilename(
    job.appName
  );


res.download(
  job.apkPath,
  `${safeName}.apk`
);

}
);

/*
|--------------------------------------------------------------------------

Internal: download project
*/

app.get(
"/api/internal/project/:jobId",
requireSecret,
(req, res) => {

const job =
  loadJob(
    req.params.jobId
  );


if (!job) {

  return res.status(404).send(
    "Job not found."
  );

}


if (
  !job.projectPath ||
  !fs.existsSync(job.projectPath)
) {

  return res.status(404).send(
    "Project file not found."
  );

}


res.download(
  job.projectPath,
  path.basename(
    job.projectPath
  )
);

}
);

/*
|--------------------------------------------------------------------------

Internal: receive APK
*/

const apkUpload =
multer({

dest: APK_DIR,

limits: {
  fileSize:
    100 * 1024 * 1024
}

});

app.post(
"/api/internal/complete/:jobId",
requireSecret,
apkUpload.single("apk"),
(req, res) => {

try {

  const job =
    loadJob(
      req.params.jobId
    );


  if (!job) {

    if (req.file) {
      removeFile(req.file.path);
    }

    return res.status(404).json({
      error: "Job not found."
    });

  }


  if (!req.file) {

    return res.status(400).json({
      error: "APK file is required."
    });

  }


  const finalPath =
    path.join(
      APK_DIR,
      `${job.jobId}.apk`
    );


  removeFile(finalPath);


  fs.renameSync(
    req.file.path,
    finalPath
  );


  job.apkPath =
    finalPath;

  job.status =
    "completed";

  job.progress =
    100;

  job.statusText =
    "APK Ready";

  job.message =
    "Your APK is ready to download.";

  job.log +=
    "\nAPK uploaded successfully.";

  saveJob(job);


  res.json({
    ok: true
  });

} catch (error) {

  console.error(error);

  if (req.file) {
    removeFile(req.file.path);
  }

  res.status(500).json({
    error:
      error.message
  });

}

}
);

/*
|--------------------------------------------------------------------------

Internal: progress
*/

app.post(
"/api/internal/progress/:jobId",
requireSecret,
(req, res) => {

const job =
  loadJob(
    req.params.jobId
  );


if (!job) {

  return res.status(404).json({
    error: "Job not found."
  });

}


const progress =
  Number(req.body.progress);


if (
  Number.isFinite(progress)
) {

  job.progress =
    Math.max(
      0,
      Math.min(
        99,
        progress
      )
    );

}


if (req.body.statusText) {

  job.statusText =
    String(
      req.body.statusText
    );

}


if (req.body.message) {

  job.message =
    String(
      req.body.message
    );

}


if (req.body.log) {

  job.log =
    String(
      req.body.log
    );

}


job.status =
  "building";


saveJob(job);


res.json({
  ok: true
});

}
);

/*
|--------------------------------------------------------------------------

Internal: failure
*/

app.post(
"/api/internal/fail/:jobId",
requireSecret,
(req, res) => {

const job =
  loadJob(
    req.params.jobId
  );


if (!job) {

  return res.status(404).json({
    error: "Job not found."
  });

}


job.status =
  "failed";

job.progress =
  100;

job.statusText =
  "Build Failed";

job.message =
  String(
    req.body.message ||
    "The Android build failed."
  );

job.error =
  String(
    req.body.error ||
    job.message
  );


if (req.body.log) {

  job.log =
    String(
      req.body.log
    );

}


saveJob(job);


res.json({
  ok: true
});

}
);

/*
|--------------------------------------------------------------------------

GitHub Actions trigger
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
//+$/,
""
);

const url =
"https://api.github.com/repos/" +
"${GITHUB_OWNER}/" +
"${GITHUB_REPO}/" +
"dispatches";

const response =
await fetch(
url,
{

    method: "POST",

    headers: {

      "Accept":
        "application/vnd.github+json",

      "Authorization":
        `Bearer ${GITHUB_TOKEN}`,

      "X-GitHub-Api-Version":
        "2022-11-28",

      "Content-Type":
        "application/json"

    },

    body:
      JSON.stringify({

        event_type:
          "four-seven-build",

        client_payload: {

          jobId:
            job.jobId,

          appName:
            job.appName,

          packageName:
            job.packageName,

          projectType:
            job.projectType,

          apiBaseUrl

        }

      })

  }
);

if (!response.ok) {

const body =
  await response.text();


throw new Error(
  `GitHub dispatch failed: ${response.status} ${body}`
);

}

}

/*
|--------------------------------------------------------------------------

Authentication for internal endpoints
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
|--------------------------------------------------------------------------

Validation
*/

function isValidPackage(value) {

return /^[a-z][a-z0-9_](.[a-z][a-z0-9_])+$/
.test(value);

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

.slice(0, 50)

|| "app";

}

/*
|--------------------------------------------------------------------------

Job storage
*/

function jobFile(jobId) {

return path.join(
DATA_DIR,
jobId,
"job.json"
);

}

function saveJob(job) {

fs.mkdirSync(
path.dirname(
jobFile(job.jobId)
),
{
recursive: true
}
);

fs.writeFileSync(
jobFile(job.jobId),
JSON.stringify(
job,
null,
2
)
);

}

function loadJob(jobId) {

if (
!/^[a-f0-9-]{20,}$/i
.test(jobId)
) {

return null;

}

const file =
jobFile(jobId);

if (
!fs.existsSync(file)
) {

return null;

}

try {

return JSON.parse(
  fs.readFileSync(
    file,
    "utf8"
  )
);

} catch {

return null;

}

}

/*
|--------------------------------------------------------------------------

File helper
*/

function removeFile(file) {

try {

if (
  file &&
  fs.existsSync(file)
) {

  fs.unlinkSync(file);

}

} catch (error) {

console.error(
  "Could not remove file:",
  error.message
);

}

}

/*
|--------------------------------------------------------------------------

Error handler
*/

app.use(
(error, req, res, next) => {

console.error(error);

res.status(400).json({

  error:
    error.message ||
    "Request failed."

});

}
);

/*
|--------------------------------------------------------------------------

Start server
*/

app.listen(
PORT,
() => {

console.log(
  `⟦ FOUR × SEVEN ⟧ Builder API running on port ${PORT}`
);

}
);