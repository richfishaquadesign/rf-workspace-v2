// UI code only; callers cannot choose arbitrary files.
function getDeferredUiBundle() {
  return Utilities.base64Encode(include('Compiled_Deferred'), Utilities.Charset.UTF_8);
}

function getAppDataIfChanged(knownVersion, pin) {
  var data = getAppData(pin);
  if (!data || data.error || data.isAuthFailed) return data;
  var serverTime = data.serverTime;
  delete data.serverTime;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(data), Utilities.Charset.UTF_8);
  var version = Utilities.base64EncodeWebSafe(digest);
  data.serverTime = serverTime;
  if (knownVersion && knownVersion === version) {
    return { unchanged: true, dataVersion: version, serverTime: serverTime };
  }
  data.dataVersion = version;
  return data;
}
