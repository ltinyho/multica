const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const SERVICE_NAME = ".notifications.InboxForegroundService";

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensurePermission(manifest, permissionName) {
  const permissions = ensureArray(manifest["uses-permission"]);
  const exists = permissions.some(
    (permission) => permission?.$?.["android:name"] === permissionName,
  );
  if (!exists) {
    permissions.push({ $: { "android:name": permissionName } });
  }
  manifest["uses-permission"] = permissions;
}

function ensureService(manifest, serviceName) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow({
    manifest,
  });
  const services = ensureArray(application.service);
  const exists = services.some(
    (service) => service?.$?.["android:name"] === serviceName,
  );
  if (!exists) {
    services.push({
      $: {
        "android:name": serviceName,
        "android:exported": "false",
        "android:foregroundServiceType": "dataSync",
      },
    });
  }
  application.service = services;
}

function packagePath(packageName) {
  return packageName.split(".").join(path.sep);
}

function notificationPackage(packageName) {
  return `${packageName}.notifications`;
}

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === contents) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function serviceSource(packageName) {
  const nativePackage = notificationPackage(packageName);
  return `package ${nativePackage}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONArray

class InboxForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private var isPolling = false
  private var wakeLock: PowerManager.WakeLock? = null

  private val pollRunnable = object : Runnable {
    override fun run() {
      if (!isPolling) return
      executor.execute { pollInbox() }
      handler.postDelayed(this, POLL_INTERVAL_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    createChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = prefs()
    val token = intent?.getStringExtra(EXTRA_TOKEN)
    val workspaceSlug = intent?.getStringExtra(EXTRA_WORKSPACE_SLUG)
    val apiUrl = intent?.getStringExtra(EXTRA_API_URL)

    if (!token.isNullOrBlank() && !workspaceSlug.isNullOrBlank() && !apiUrl.isNullOrBlank()) {
      prefs.edit()
        .putString(KEY_TOKEN, token)
        .putString(KEY_WORKSPACE_SLUG, workspaceSlug)
        .putString(KEY_API_URL, apiUrl.trimEnd('/'))
        .putBoolean(KEY_ACTIVE, true)
        .apply()
    }

    if (!prefs.getBoolean(KEY_ACTIVE, false) || !hasConfig(prefs)) {
      stopSelf()
      return START_NOT_STICKY
    }

    acquireWakeLock()
    startForeground(FOREGROUND_NOTIFICATION_ID, foregroundNotification())
    if (!isPolling) {
      isPolling = true
      handler.post(pollRunnable)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    isPolling = false
    handler.removeCallbacks(pollRunnable)
    executor.shutdownNow()
    releaseWakeLock()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun pollInbox() {
    val prefs = prefs()
    val token = prefs.getString(KEY_TOKEN, null) ?: return
    val workspaceSlug = prefs.getString(KEY_WORKSPACE_SLUG, null) ?: return
    val apiUrl = prefs.getString(KEY_API_URL, null)?.trimEnd('/') ?: return
    var connection: HttpURLConnection? = null

    try {
      val url = URL("$apiUrl/api/inbox")
      connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 10_000
        readTimeout = 10_000
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("X-Workspace-Slug", workspaceSlug)
        setRequestProperty("X-Client-Platform", "mobile")
        setRequestProperty("X-Client-OS", "android")
        setRequestProperty("X-Client-Version", appVersionName())
      }

      val code = connection.responseCode
      if (code == HttpURLConnection.HTTP_UNAUTHORIZED) {
        prefs.edit().putBoolean(KEY_ACTIVE, false).apply()
        stopSelf()
        return
      }
      if (code !in 200..299) {
        return
      }

      val body = connection.inputStream.bufferedReader().use { it.readText() }
      notifyUnreadItems(JSONArray(body), prefs)
    } catch (err: Exception) {
    } finally {
      connection?.disconnect()
    }
  }

  private fun notifyUnreadItems(items: JSONArray, prefs: SharedPreferences) {
    val notified = prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
    var changed = false

    for (index in 0 until items.length()) {
      val item = items.optJSONObject(index) ?: continue
      val id = item.optString("id")
      if (item.optBoolean("read", false) || item.optBoolean("archived", false)) continue
      if (id.isBlank() || notified.contains(id)) continue

      val title = item.optString("title").ifBlank { "New inbox message" }
      val body = item.optString("body").ifBlank { title }
      sendInboxNotification(id, title, body)
      notified.add(id)
      changed = true
    }

    if (changed) {
      prefs.edit().putStringSet(KEY_NOTIFIED_IDS, notified).apply()
    }
  }

  private fun sendInboxNotification(id: String, title: String, body: String) {
    val notification = NotificationCompat.Builder(this, INBOX_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(launchIntent())
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(id.hashCode(), notification)
  }

  private fun foregroundNotification() =
    NotificationCompat.Builder(this, FOREGROUND_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Multica")
      .setContentText("Checking inbox in the background")
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(launchIntent())
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

  private fun acquireWakeLock() {
    val current = wakeLock
    if (current?.isHeld == true) return
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:InboxForegroundService")
      .apply {
        setReferenceCounted(false)
        acquire()
      }
  }

  private fun releaseWakeLock() {
    val current = wakeLock
    if (current?.isHeld == true) {
      current.release()
    }
    wakeLock = null
  }

  private fun launchIntent(): PendingIntent? {
    val intent = packageManager.getLaunchIntentForPackage(packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        FOREGROUND_CHANNEL_ID,
        "Multica background service",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Keeps Multica inbox checks running in the background."
        setShowBadge(false)
      },
    )
    manager.createNotificationChannel(
      NotificationChannel(
        INBOX_CHANNEL_ID,
        "Multica inbox alerts",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "High-priority inbox alerts from Multica."
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 250, 120, 250)
        setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      },
    )
  }

  private fun hasConfig(prefs: SharedPreferences): Boolean =
    !prefs.getString(KEY_TOKEN, null).isNullOrBlank() &&
      !prefs.getString(KEY_WORKSPACE_SLUG, null).isNullOrBlank() &&
      !prefs.getString(KEY_API_URL, null).isNullOrBlank()

  private fun prefs(): SharedPreferences =
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun appVersionName(): String =
    try {
      packageManager.getPackageInfo(packageName, 0).versionName ?: "0.1.0"
    } catch (_: Exception) {
      "0.1.0"
    }

  companion object {
    const val EXTRA_TOKEN = "token"
    const val EXTRA_WORKSPACE_SLUG = "workspaceSlug"
    const val EXTRA_API_URL = "apiUrl"
    const val PREFS_NAME = "multica_inbox_foreground_service"
    const val KEY_ACTIVE = "active"
    const val KEY_TOKEN = "token"
    const val KEY_WORKSPACE_SLUG = "workspaceSlug"
    const val KEY_API_URL = "apiUrl"
    const val KEY_NOTIFIED_IDS = "notifiedIds"
    private const val POLL_INTERVAL_MS = 30_000L
    private const val FOREGROUND_NOTIFICATION_ID = 4001
    private const val FOREGROUND_CHANNEL_ID = "multica_foreground_service"
    private const val INBOX_CHANNEL_ID = "multica_inbox_alerts_v2"
  }
}
`;
}

function moduleSource(packageName) {
  const nativePackage = notificationPackage(packageName);
  return `package ${nativePackage}

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class InboxForegroundModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "InboxForegroundService"

  @ReactMethod
  fun start(token: String, workspaceSlug: String, apiUrl: String) {
    if (token.isBlank() || workspaceSlug.isBlank() || apiUrl.isBlank()) return

    val serviceIntent = Intent(reactContext, InboxForegroundService::class.java).apply {
      putExtra(InboxForegroundService.EXTRA_TOKEN, token)
      putExtra(InboxForegroundService.EXTRA_WORKSPACE_SLUG, workspaceSlug)
      putExtra(InboxForegroundService.EXTRA_API_URL, apiUrl)
    }

    reactContext
      .getSharedPreferences(InboxForegroundService.PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(InboxForegroundService.KEY_ACTIVE, true)
      .apply()

    ContextCompat.startForegroundService(reactContext, serviceIntent)
  }

  @ReactMethod
  fun stop() {
    reactContext
      .getSharedPreferences(InboxForegroundService.PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(InboxForegroundService.KEY_ACTIVE, false)
      .apply()
    reactContext.stopService(Intent(reactContext, InboxForegroundService::class.java))
  }
}
`;
}

function packageSource(packageName) {
  const nativePackage = notificationPackage(packageName);
  return `package ${nativePackage}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class InboxForegroundPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(InboxForegroundModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
`;
}

async function patchMainApplication(projectRoot, packageName) {
  const mainApplicationPath = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "java",
    ...packageName.split("."),
    "MainApplication.kt",
  );
  let source = fs.readFileSync(mainApplicationPath, "utf8");
  const importLine = `import ${notificationPackage(packageName)}.InboxForegroundPackage`;
  if (!source.includes(importLine)) {
    const packageLine = `package ${packageName}`;
    source = source.replace(packageLine, `${packageLine}\n\n${importLine}`);
  }
  const addLine = "          add(InboxForegroundPackage())";
  if (!source.includes(addLine)) {
    source = source.replace(
      "          // add(MyReactNativePackage())",
      `          // add(MyReactNativePackage())\n${addLine}`,
    );
  }
  fs.writeFileSync(mainApplicationPath, source);
}

const withForegroundInboxService = (config) => {
  config = withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE");
    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE_DATA_SYNC");
    ensurePermission(manifest, "android.permission.POST_NOTIFICATIONS");
    ensurePermission(manifest, "android.permission.WAKE_LOCK");
    ensureService(manifest, SERVICE_NAME);
    return manifestConfig;
  });

  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const packageName = modConfig.android?.package ?? "ai.multica.mobile";
      const sourceDir = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        ...packagePath(packageName).split(path.sep),
        "notifications",
      );
      writeFileIfChanged(
        path.join(sourceDir, "InboxForegroundService.kt"),
        serviceSource(packageName),
      );
      writeFileIfChanged(
        path.join(sourceDir, "InboxForegroundModule.kt"),
        moduleSource(packageName),
      );
      writeFileIfChanged(
        path.join(sourceDir, "InboxForegroundPackage.kt"),
        packageSource(packageName),
      );
      await patchMainApplication(projectRoot, packageName);
      return modConfig;
    },
  ]);

  return config;
};

module.exports = withForegroundInboxService;
