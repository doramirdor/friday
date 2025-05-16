const { promisify } = require("util");
const { exec } = require("child_process");
const execAsync = promisify(exec);

module.exports.checkPermissions = async () => {
  try {
    const { stdout: checkPermissionStdout } = await execAsync("./src/swift/Recorder --check-permissions");
    const { code: checkPermissionCode } = JSON.parse(checkPermissionStdout);
    return checkPermissionCode === "PERMISSION_GRANTED";
  } catch (error) {
    console.error("Error checking permissions:", error);
    return false;
  }
}; 