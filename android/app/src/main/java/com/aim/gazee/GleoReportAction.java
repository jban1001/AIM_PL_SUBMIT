package com.aim.gazee;

import android.app.Activity;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.function.BiConsumer;
import java.util.UUID;

final class GleoReportAction {
    static final String ACTION = "GAZEE_CREATE_REPORT";
    private static final String CALLBACK = "ai.pleos.playground.intent.action.APP_ACTION_RESPONSE";
    private static final String GLEO_PACKAGE = "ai.umos.ambientai";

    private final Activity activity;
    private final BiConsumer<String, String> deliver;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> finish("fail", "The report request timed out.");
    private boolean webReady;
    private boolean sent;
    private String pending;
    private String requestId;

    GleoReportAction(Activity activity, BiConsumer<String, String> deliver) {
        this.activity = activity;
        this.deliver = deliver;
    }

    void accept(Intent intent) {
        if (intent == null) return;
        String requestedAction = intent.getAction();
        if (!ACTION.equals(requestedAction)
                && !(activity.getPackageName() + "." + ACTION).equals(requestedAction)) return;
        if (pending != null) {
            sendResponse("fail", "A report is already being processed.");
            return;
        }
        String body = readReport(intent);
        if (body.isEmpty()) {
            sendResponse("asking", "A description of the road condition is required.");
            return;
        }
        if (body.length() > 500) {
            sendResponse("fail", "The report description is too long.");
            return;
        }
        pending = body;
        requestId = UUID.randomUUID().toString();
        sent = false;
        main.postDelayed(timeout, 6_000);
        Log.i("GazeePleos", "Gleo Action accepted");
    }

    void webReady() {
        webReady = true;
    }

    void dispatch(boolean vehicleAllowsInteraction) {
        if (!webReady || !vehicleAllowsInteraction || pending == null || sent) return;
        sent = true;
        deliver.accept(requestId, pending);
    }

    void finish(String id, boolean success) {
        if (!id.equals(requestId)) return;
        finish(success ? "success" : "fail", success
                ? "The road report was registered."
                : "The road report could not be registered.");
    }

    void close() {
        finish("fail", "The reporting screen closed.");
    }

    private void finish(String status, String message) {
        if (pending == null) return;
        main.removeCallbacks(timeout);
        pending = null;
        requestId = null;
        sent = false;
        sendResponse(status, message);
    }

    private void sendResponse(String status, String message) {
        try {
            JSONObject response = new JSONObject()
                    .put("functionName", ACTION)
                    .put("status", status)
                    .put("mode", "voice")
                    .put("message", message);
            if ("success".equals(status)) {
                response.put("data", "[{\"confirmation\":\"제보가 등록되었어요.\"}]");
            }
            Intent reply = new Intent(CALLBACK).setPackage(GLEO_PACKAGE)
                    .putExtra("packageName", activity.getPackageName())
                    .putExtra("response", response.toString());
            activity.sendBroadcast(reply);
            Log.i("GazeePleos", "Gleo callback: " + status);
        } catch (JSONException error) {
            Log.w("GazeePleos", "Could not create Gleo callback", error);
        }
    }

    private static String readReport(Intent intent) {
        String direct = intent.getStringExtra("report");
        if (direct != null) return direct.trim();
        String encoded = intent.getStringExtra("ACTION_PARAM");
        if (encoded == null || encoded.length() > 2_000) return "";
        try {
            Object payload = new JSONTokener(encoded).nextValue();
            if (payload instanceof String) payload = new JSONTokener((String) payload).nextValue();
            return payload instanceof JSONObject ? ((JSONObject) payload).optString("report", "").trim() : "";
        } catch (JSONException error) {
            return "";
        }
    }
}
