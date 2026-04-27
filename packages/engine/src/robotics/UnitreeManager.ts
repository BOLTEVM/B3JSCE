import * as ROSLIB from 'roslib';
import { RoboticsManager, TelemetryData } from './RoboticsManager';
import { B3Engine } from '../index';

/**
 * UnitreeManager: ROS2-based implementation for Unitree Robots (B1, Go2, Aliengo).
 * Uses rosbridge_suite for WebSocket communication.
 */
export class UnitreeManager extends RoboticsManager {
    private ros: ROSLIB.Ros | null = null;
    private cmdVelTopic: ROSLIB.Topic | null = null;
    private jointStateTopic: ROSLIB.Topic | null = null;
    private lastMoveTime: number = 0;
    private moveDebounce: number = 50; // ms

    constructor(engine: B3Engine) {
        super(engine);
    }

    async connect(uri: string): Promise<boolean> {
        this.status = 'Connecting';
        console.log(`B3JS Robotics: Connecting to Unitree at ${uri}...`);

        return new Promise((resolve) => {
            try {
                this.ros = new ROSLIB.Ros({ url: uri });

                this.ros.on('connection', () => {
                    this.status = 'Connected';
                    console.log("B3JS Robotics: Connected to Unitree via rosbridge.");
                    this.initTopics();
                    resolve(true);
                });

                this.ros.on('error', (error) => {
                    this.status = 'Error';
                    console.error("B3JS Robotics: ROS Connection Error", error);
                    resolve(false);
                });

                this.ros.on('close', () => {
                    this.status = 'Disconnected';
                    console.warn("B3JS Robotics: Connection closed.");
                });
            } catch (e) {
                this.status = 'Error';
                resolve(false);
            }
        });
    }

    private initTopics() {
        if (!this.ros) return;

        // Locomotion Topic
        this.cmdVelTopic = new ROSLIB.Topic({
            ros: this.ros,
            name: '/cmd_vel',
            messageType: 'geometry_msgs/Twist'
        });

        // Joint State Topic (Feedback)
        this.jointStateTopic = new ROSLIB.Topic({
            ros: this.ros,
            name: '/joint_states',
            messageType: 'sensor_msgs/JointState'
        });

        this.jointStateTopic.subscribe((message: any) => {
            this.handleJointState(message);
        });
    }

    private handleJointState(msg: any) {
        this.telemetry.timestamp = Date.now();
        
        // Map arrays to our telemetry map
        if (msg.name && msg.position) {
            for (let i = 0; i < msg.name.length; i++) {
                this.telemetry.jointStates.set(msg.name[i], msg.position[i]);
            }
        }
        
        this.notifyTelemetry();
    }

    disconnect(): void {
        if (this.ros) {
            this.ros.close();
            this.ros = null;
        }
    }

    move(linear: { x: number, y: number, z: number }, angular: { x: number, y: number, z: number }): void {
        if (!this.cmdVelTopic || this.status !== 'Connected') return;

        const now = Date.now();
        if (now - this.lastMoveTime < this.moveDebounce) return;
        this.lastMoveTime = now;

        const twist = {
            linear: { x: linear.x, y: linear.y, z: linear.z },
            angular: { x: angular.x, y: angular.y, z: angular.z }
        };

        this.cmdVelTopic.publish(twist);
    }

    getVideoStreamURI(): string | null {
        // MJPEG fallback via web_video_server is standard for Unitree ROS sets
        // Mocking the high-performance WebRTC endpoint for future implementation
        /*
        PSEUDOCODE: WebRTC Video Sync
        if (this.config.useWebRTC) {
            return this.webrtcManager.getStreamId('robot_front_cam');
        }
        */
        return "/mock/video/stream?topic=/camera/image_raw"; 
    }
}
