/*

* ⟦ FOUR × SEVEN ⟧
* Universal App & Game Builder
  */

const API_URL = "/api";

let selectedType = "app";
let currentJobId = null;
let pollTimer = null;

/* Elements */

const fileInput =
document.getElementById("projectFile");

const fileName =
document.getElementById("fileName");

const appNameInput =
document.getElementById("appName");

const packageInput =
document.getElementById("packageName");

const buildBtn =
document.getElementById("buildBtn");

const buildPanel =
document.getElementById("buildPanel");

const buildTitle =
document.getElementById("buildTitle");

const buildPercent =
document.getElementById("buildPercent");

const progressBar =
document.getElementById("progressBar");

const buildMessage =
document.getElementById("buildMessage");

const buildLog =
document.getElementById("buildLog");

const downloadBtn =
document.getElementById("downloadBtn");

const errorBox =
document.getElementById("errorBox");

/* Project type */

document.querySelectorAll(".type-btn").forEach(button => {

button.addEventListener("click", () => {

document.querySelectorAll(".type-btn")
  .forEach(btn => {
    btn.classList.remove("active");
  });

button.classList.add("active");

selectedType =
  button.dataset.type;

addLog(
  `Project type selected: ${selectedType}`
);

});

});

/* File selection */

fileInput.addEventListener(
"change",
() => {

if (!fileInput.files.length) {

  fileName.textContent =
    "No file selected";

  return;

}


const file =
  fileInput.files[0];


fileName.textContent =
  `${file.name} (${formatBytes(file.size)})`;

}
);

/* Start build */

buildBtn.addEventListener(
"click",
startBuild
);

async function startBuild() {

clearError();

const file =
fileInput.files[0];

const appName =
appNameInput.value.trim();

const packageName =
packageInput.value.trim();

if (!file) {

showError(
  "Please choose an HTML or ZIP project."
);

return;

}

if (!appName) {

showError(
  "Please enter an app name."
);

return;

}

if (
!isValidPackage(packageName)
) {

showError(
  "Package name must look like com.example.myapp"
);

return;

}

const extension =
file.name
.split(".")
.pop()
.toLowerCase();

if (
!["html", "htm", "zip"]
.includes(extension)
) {

showError(
  "Only HTML, HTM and ZIP files are supported."
);

return;

}

/* Maximum browser-side size check */

const maxSize =
25 * 1024 * 1024;

if (file.size > maxSize) {

showError(
  "The project is too large. Maximum size is 25 MB."
);

return;

}

const formData =
new FormData();

formData.append(
"project",
file
);

formData.append(
"appName",
appName
);

formData.append(
"packageName",
packageName
);

formData.append(
"projectType",
selectedType
);

/* Disable button */

buildBtn.disabled = true;

downloadBtn.classList.add(
"hidden"
);

buildPanel.classList.remove(
"hidden"
);

buildLog.textContent =
"";

setProgress(
5,
"Starting",
"Preparing your project..."
);

addLog(
"FOUR × SEVEN build started."
);

try {

const response =
  await fetch(
    `${API_URL}/build`,
    {
      method: "POST",
      body: formData
    }
  );


const data =
  await response.json();


if (!response.ok) {

  throw new Error(
    data.error ||
    "The server rejected the project."
  );

}


if (!data.jobId) {

  throw new Error(
    "The server did not return a build ID."
  );

}


currentJobId =
  data.jobId;


addLog(
  `Build ID: ${currentJobId}`
);


addLog(
  "Project uploaded successfully."
);


setProgress(
  15,
  "Queued",
  "Waiting for the Android build runner..."
);


pollStatus();

} catch (error) {

console.error(error);

showError(
  error.message ||
  "Something went wrong."
);

buildBtn.disabled =
  false;

}

}

/* Poll server */

function pollStatus() {

if (pollTimer) {

clearTimeout(
  pollTimer
);

}

pollTimer =
setTimeout(
checkStatus,
3000
);

}

async function checkStatus() {

if (!currentJobId) {
return;
}

try {

const response =
  await fetch(
    `${API_URL}/build/${encodeURIComponent(currentJobId)}`
  );


const data =
  await response.json();


if (!response.ok) {

  throw new Error(
    data.error ||
    "Could not check build status."
  );

}


updateBuildStatus(
  data
);


if (
  data.status === "completed"
) {

  buildFinished(
    data
  );

  return;

}


if (
  data.status === "failed"
) {

  showError(
    data.error ||
    data.message ||
    "The APK build failed."
  );


  if (data.log) {

    buildLog.textContent =
      data.log;

  }


  buildBtn.disabled =
    false;

  return;

}


pollStatus();

} catch (error) {

console.error(error);

showError(
  error.message ||
  "Connection to the builder failed."
);


buildBtn.disabled =
  false;

}

}

/* Update progress */

function updateBuildStatus(
data
) {

let percent =
Number(
data.progress || 0
);

percent =
Math.max(
0,
Math.min(
99,
percent
)
);

setProgress(
percent,
data.statusText ||
"Building",
data.message ||
"Building your Android APK..."
);

if (data.log) {

buildLog.textContent =
  data.log;


buildLog.scrollTop =
  buildLog.scrollHeight;

}

}

/* Build complete */

function buildFinished(
data
) {

setProgress(
100,
"APK Ready! 🎉",
"Your Android APK has been built successfully."
);

addLog(
"APK build completed successfully."
);

const downloadUrl =
data.downloadUrl ||
"${API_URL}/download/${encodeURIComponent(currentJobId)}";

downloadBtn.href =
downloadUrl;

downloadBtn.classList.remove(
"hidden"
);

buildBtn.disabled =
false;

currentJobId =
null;

}

/* Progress UI */

function setProgress(
percent,
title,
message
) {

buildTitle.textContent =
title;

buildPercent.textContent =
"${Math.round(percent)}%";

progressBar.style.width =
"${percent}%";

buildMessage.textContent =
message;

}

/* Build log */

function addLog(
text
) {

if (!buildLog) {
return;
}

const time =
new Date()
.toLocaleTimeString();

buildLog.textContent +=
"[${time}] ${text}\n";

buildLog.scrollTop =
buildLog.scrollHeight;

}

/* Show error */

function showError(
message
) {

errorBox.textContent =
message;

errorBox.classList.remove(
"hidden"
);

}

function clearError() {

errorBox.textContent =
"";

errorBox.classList.add(
"hidden"
);

}

/* Android package validation */

function isValidPackage(
value
) {

return /^[a-z][a-z0-9_](.[a-z][a-z0-9_])+$/
.test(value);

}

/* File size */

function formatBytes(
bytes
) {

if (bytes === 0) {

return "0 Bytes";

}

const units = [
"Bytes",
"KB",
"MB",
"GB"
];

const index =
Math.floor(
Math.log(bytes) /
Math.log(1024)
);

const size =
bytes /
Math.pow(
1024,
index
);

return (
size.toFixed(1) +
" " +
units[index]
);

}

/* Prevent accidental page refresh during build */

window.addEventListener(
"beforeunload",
event => {

if (
  currentJobId &&
  buildBtn.disabled
) {

  event.preventDefault();

  event.returnValue = "";

}

}
);