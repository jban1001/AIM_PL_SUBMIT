package com.aim.gazee;

import android.app.Activity;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

final class GleoReportAction {
    static final String ACTION = "GAZEE_CREATE_REPORT";
    static final String READ_ACTION = "GAZEE_READ_RECEIVED_REPORT";
    private static final String CALLBACK = "ai.pleos.playground.intent.action.APP_ACTION_RESPONSE";
    private static final String GLEO_PACKAGE = "ai.umos.ambientai";

    private final Activity activity;
    private final BiConsumer<String, String> deliver;
    private final Consumer<String> deliverRead;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> finish("fail", "The report request timed out.", null);
    private boolean webReady;
    private boolean sent;
    private String pending;
    private String pendingAction;
    private String requestId;

    GleoReportAction(Activity activity, BiConsumer<String, String> deliver, Consumer<String> deliverRead) {
        this.activity = activity;
        this.deliver = deliver;
        this.deliverRead = deliverRead;
    }

    void accept(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String prefix = activity.getPackageName() + ".";
        if (action != null && action.startsWith(prefix)) action = action.substring(prefix.length());
        if (!ACTION.equals(action) && !READ_ACTION.equals(action)) return;
        if (pending != null) {
            sendResponse(action, "fail", "A report request is already being processed.", null);
            return;
        }
        String body = READ_ACTION.equals(action) ? "" : readReport(intent);
        if (ACTION.equals(action) && body.isEmpty()) {
            sendResponse(action, "asking", "A description of the road condition is required.", null);
            return;
        }
        if (body.length() > 500) {
            sendResponse(action, "fail", "The report description is too long.", null);
            return;
        }
        pending = body;
        pendingAction = action;
        requestId = UUID.randomUUID().toString();
        sent = false;
        main.postDelayed(timeout, 6_000);
        Log.i("GazeePleos", "Gleo Action accepted · " + action);
    }

    void webReady() {
        webReady = true;
    }

    void dispatch(boolean vehicleAllowsInteraction) {
        if (!webReady || !vehicleAllowsInteraction || pending == null || sent) return;
        sent = true;
        if (READ_ACTION.equals(pendingAction)) deliverRead.accept(requestId);
        else deliver.accept(requestId, pending);
    }

    void finish(String id, boolean success) {
        if (!id.equals(requestId) || !ACTION.equals(pendingAction)) return;
        finish(success ? "success" : "fail", success
                ? "The road report was registered."
                : "The road report could not be registered.", success
                ? "[{\"confirmation\":\"제보가 등록되었어요.\"}]" : null);
    }

    void finishRead(String id, String speech) {
        if (!id.equals(requestId) || !READ_ACTION.equals(pendingAction)) return;
        if (speech == null || speech.trim().isEmpty() || speech.length() > 500) {
            finish("fail", "There is no received road report available to read.", null);
            return;
        }
        try {
            String data = "[" + new JSONObject()
                    .put("roadReport", speech)
                    .put("source", "Driver report")
                    .put("verified", false) + "]";
            finish("success", "A nearby road report is available for the driver.", data);
        } catch (JSONException error) {
            finish("fail", "The road report could not be read.", null);
        }
    }

    void close() {
        finish("fail", "The reporting screen closed.", null);
    }

    private void finish(String status, String message, String data) {
        if (pending == null) return;
        String action = pendingAction;
        main.removeCallbacks(timeout);
        pending = null;
        pendingAction = null;
        requestId = null;
        sent = false;
        sendResponse(action, status, message, data);
    }

    private void sendResponse(String action, String status, String message, String data) {
        try {
            JSONObject response = new JSONObject()
                    .put("functionName", action)
                    .put("status", status)
                    .put("mode", "voice")
                    .put("message", message);
            if (data != null) response.put("data", data);
            Intent reply = new Intent(CALLBACK).setPackage(GLEO_PACKAGE)
                    .putExtra("packageName", activity.getPackageName())
                    .putExtra("response", response.toString());
            activity.sendBroadcast(reply);
            Log.i("GazeePleos", "Gleo callback · " + action + " · " + status);
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
