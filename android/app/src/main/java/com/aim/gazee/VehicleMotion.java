package com.aim.gazee;

import android.car.Car;
import android.car.VehicleGear;
import android.car.VehiclePropertyIds;
import android.car.hardware.CarPropertyValue;
import android.car.hardware.property.CarPropertyManager;
import android.util.Log;

final class VehicleMotion implements CarPropertyManager.CarPropertyEventCallback {
    private static final String TAG = "GazeeVehicle";
    private static final float RESTRICTION_SPEED_MPS = (float) (30.0 / 3.6);

    private final Runnable onChange;
    private CarPropertyManager manager;
    private Integer gear;
    private Float speedMetersPerSecond;
    private boolean speedSubscribed;

    VehicleMotion(Runnable onChange) {
        this.onChange = onChange;
    }

    void connect(Car car, boolean speedAllowed) {
        close();
        try {
            manager = (CarPropertyManager) car.getCarManager(Car.PROPERTY_SERVICE);
            if (manager == null) return;
            if (!manager.registerCallback(this, VehiclePropertyIds.GEAR_SELECTION,
                    CarPropertyManager.SENSOR_RATE_ONCHANGE)) {
                Log.w(TAG, "GEAR_SELECTION not supported");
            }
            if (speedAllowed) subscribeSpeed();
        } catch (RuntimeException error) {
            Log.w(TAG, "Vehicle gear signal unavailable", error);
        }
    }

    void subscribeSpeed() {
        if (manager == null || speedSubscribed) return;
        try {
            speedSubscribed = manager.registerCallback(this, VehiclePropertyIds.PERF_VEHICLE_SPEED,
                    CarPropertyManager.SENSOR_RATE_UI);
            if (!speedSubscribed) Log.w(TAG, "PERF_VEHICLE_SPEED not supported");
        } catch (RuntimeException error) {
            Log.w(TAG, "Vehicle speed signal unavailable", error);
        }
    }

    private boolean hasDriveSpeed() {
        return gear != null && gear == VehicleGear.GEAR_DRIVE
                && speedMetersPerSecond != null && speedMetersPerSecond >= 0f;
    }

    String demoState() {
        if (gear != null && gear == VehicleGear.GEAR_PARK) return "parked";
        if (!hasDriveSpeed()) return null;
        return speedMetersPerSecond >= RESTRICTION_SPEED_MPS ? "driving" : "stopped";
    }

    @Override
    public void onChangeEvent(CarPropertyValue value) {
        final Object reading = value.getStatus() == CarPropertyValue.STATUS_AVAILABLE
                ? value.getValue() : null;
        if (value.getPropertyId() == VehiclePropertyIds.GEAR_SELECTION) {
            gear = reading instanceof Integer ? (Integer) reading : null;
        } else if (value.getPropertyId() == VehiclePropertyIds.PERF_VEHICLE_SPEED) {
            speedMetersPerSecond = reading instanceof Float && Float.isFinite((Float) reading)
                    ? (Float) reading : null;
        }
        onChange.run();
    }

    @Override
    public void onErrorEvent(int property, int area) {
        if (property == VehiclePropertyIds.GEAR_SELECTION) gear = null;
        if (property == VehiclePropertyIds.PERF_VEHICLE_SPEED) speedMetersPerSecond = null;
        onChange.run();
    }

    void close() {
        if (manager != null) {
            try {
                manager.unregisterCallback(this);
            } catch (RuntimeException error) {
                Log.w(TAG, "Could not release vehicle signal listener", error);
            }
        }
        manager = null;
        gear = null;
        speedMetersPerSecond = null;
        speedSubscribed = false;
    }
}
