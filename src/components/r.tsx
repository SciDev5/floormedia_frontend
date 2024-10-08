import { ConnectionProvider, SERVER, useConnection, usePlayState } from "@/sys/connection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./r.module.css";
import { Button, LabelText, NumberInput, STYLE_JOIN_TO_RIGHT, TextInput } from "./basic";
import { SongInfo } from "@/sys/connection_types";

export function R() {
    return (
        <ConnectionProvider not_connected={<>not connected</>}>
            <RConnected />
        </ConnectionProvider>
    )
}

function RConnected() {
    const [watch_mode, set_watch_mode] = useState(false)

    useEffect(() => {
        if (!watch_mode) return
        const ev = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                set_watch_mode(false)
            }
        }
        const ev_touch = () => {
            set_watch_mode(false)
        }
        window.addEventListener("keydown", ev)
        window.addEventListener("touchstart", ev_touch)
        return () => {
            window.removeEventListener("keydown", ev)
            window.removeEventListener("touchstart", ev_touch)
        }
    }, [watch_mode])

    return (
        watch_mode
            ? <WatchVideo />
            : (
                <div>
                    <div className={styles.page_header}>
                        {/* <h1 className={styles.title}>:: clamedia :: <span>media server</span></h1> */}
                        <Button
                            classes={[styles.enter_watch_mode]}
                            on_click={() => set_watch_mode(true)}
                        >enter watch mode</Button>
                    </div>
                    <ControlVideo />
                </div>
            )
    )
}
function ControlVideo() {
    const conn = useConnection()
    useEffect(() => {
        setTimeout(() => conn.send_req_sync())
    }, [conn])
    return (
        <div className={styles.control}>
            <div>
                <span className={styles.head}>playing:</span>
                <ControlVideoPlayerControls />
            </div>
            <div>
                <span className={styles.head}>request:</span>
                <ControlVideoRequests />
            </div>
            <div>
                <span className={styles.head}>queue:</span>
                <ControlVideoQueue />
            </div>
            <div>
                <span className={styles.head}>cached:</span>
                <ControlVideoCached />
            </div>
        </div>
    )
}
function WatchVideo() {
    const ref = useRef<HTMLVideoElement>(null)
    const conn = useConnection()

    const [current, set_current] = useState(conn.last_received.current)
    const [current_discriminator, set_current_discriminator] = useState(conn.last_received.current_discriminator)
    conn.on_video_change.use_bind(useCallback((current, current_discriminator) => {
        set_current(current)
        set_current_discriminator(current_discriminator)
    }, [set_current, set_current_discriminator]))

    const { playing, get_time } = usePlayState(conn)

    useEffect(() => {
        const vid = ref.current
        if (vid == null) { return }
        vid.volume = conn.last_received.volume
    }, [current, conn])
    useEffect(() => {
        const vid = ref.current
        if (vid == null) { return }
        vid.currentTime = get_time() / 1000
        if (playing) {
            vid.play()
        } else {
            vid.pause()
        }
    }, [current, playing, get_time])
    conn.on_volume.use_bind(useCallback(volume => {
        const vid = ref.current
        if (vid == null) { return }

        vid.volume = volume
    }, []))

    return (
        current ? <video
            className={styles.watch}
            src={`http${SERVER.SECURE ? "s" : ""}://${SERVER.HOST}/song/${current}`}
            autoPlay={playing}
            onEnded={() => {
                conn.send_req_next(current_discriminator)
            }}
            ref={ref}
        /> : (<div className={styles.no_media}>
            <h1>... no media playing ...</h1>
            <h3>queue something at<br />{location.href}</h3>
        </div>
        )
    )
}


function ControlVideoPlayerControls() {
    const conn = useConnection()
    const [current, set_current] = useState(conn.last_received.current)
    conn.on_video_change.use_bind(useCallback((current, current_discriminator) => {
        set_current(current)
    }, [set_current]))

    const [is_playing, set_is_playing] = useState(conn.last_received.playstate.playing)
    conn.on_pauseplay.use_bind(set_is_playing)

    const [volume, set_volume] = useState(conn.last_received.volume)
    conn.on_volume.use_bind(set_volume)

    const [cached, set_cached] = useState(new Map(conn.last_received.cached))
    conn.on_cache_update.use_bind(() => set_cached(new Map(conn.last_received.cached)))
    return (
        <div>
            {current != null
                ? cached.has(current)
                    ? (<div>{`"${cached.get(current)!.title}" [${cached.get(current)!.uploader}]`}</div>)
                    : <div>!! unloaded song playing !!</div>
                : <div>no song playing</div>
            }
            <div className={styles.controls}>
                <br />
                <h4>[playback controls]</h4>
                <div>
                    <Button
                        on_click={() => {
                            conn.req_pauseplay(!is_playing)
                        }}
                    >{is_playing ? "pause" : "play"}</Button>
                </div>
                <div>
                    <Button
                        on_click={() => {
                            conn.req_seek(0)
                        }}
                        classes={[STYLE_JOIN_TO_RIGHT]}
                    >replay</Button>
                    <Button
                        on_click={() => {
                            conn.send_req_skip()
                        }}
                    >skip</Button>
                </div>
                <br />
                <div>
                    <NumberInput
                        label={<LabelText>volume</LabelText>}
                        // is_slider
                        min={0.0}
                        max={1.0}
                        step={0.01}
                        value={Math.round(volume * 1000) / 1000}
                        set_value={volume => conn.send_req_volume(Math.max(0, Math.min(1, volume)))}
                    />
                </div>
                <div>
                    <NumberInput
                        // label={<LabelText>volume</LabelText>}
                        is_slider
                        min={-2.0}
                        max={0.0}
                        step={0.01}
                        value={Math.log10(Math.max(1e-2, Math.min(1, volume)))}
                        set_value={log_volume => conn.send_req_volume(log_volume === -2 ? 0 : Math.max(0, Math.min(1, 10 ** log_volume)))}
                    />
                </div>
                <ControlVideoPlayerSeekControls />
            </div>
        </div>
    )
}
function ControlVideoPlayerSeekControls() {
    const conn = useConnection()

    const [current, set_current] = useState(conn.last_received.current)
    conn.on_video_change.use_bind(useCallback(current => {
        set_current(current)
    }, [set_current]))

    const { playing, get_time } = usePlayState(conn)
    const [time, set_raw_time] = useState(0)

    useEffect(() => {
        if (current == null) {
            set_raw_time(0)
        } else if (playing) {
            const id = setInterval(() => {
                set_raw_time(get_time())
            }, 50)
            return () => {
                clearInterval(id)
            }
        } else {
            set_raw_time(get_time())
        }
    }, [playing, current, get_time])

    const len = current != null ? conn.last_received.cached.get(current)?.length ?? 0.0 : 0.0
    const set_time = useCallback((t: number) => {
        conn.req_seek(t * 1000)
    }, [conn])

    const t_sec = Math.floor(time / 1000) % 60
    const t_min = Math.floor(time / 1000 / 60) % 60
    const t_hrs = Math.floor(time / 1000 / 60 / 60)

    return (<>
        <br />
        <h4>[time controls]</h4>
        <div>
            <NumberInput
                is_slider
                min={0.0}
                max={len}
                step={0.01}
                value={time / 1000}
                disabled={current == null}
                set_value={set_time}
            />
        </div>
        <div>

            {Math.floor(len / 60 / 60) > 0 && <NumberInput
                min={0}
                max={Math.floor(len / 60 / 60)}
                step={1}
                value={t_hrs}
                disabled={current == null}
                classes={[STYLE_JOIN_TO_RIGHT, styles.time_thin]}
                set_value={t => set_time(t_sec + 60 * (t_min + 60 * t))}
            />}
            <NumberInput
                min={0}
                max={60}
                step={1}
                value={t_min}
                disabled={current == null}
                classes={[STYLE_JOIN_TO_RIGHT, styles.time_thin]}
                set_value={t => set_time(t_sec + 60 * (t + 60 * t_hrs))}
            />
            <NumberInput
                min={0}
                max={60}
                step={1}
                value={t_sec}
                disabled={current == null}
                classes={[STYLE_JOIN_TO_RIGHT, styles.time_thin]}
                set_value={t => set_time(t + 60 * (t_min + 60 * t_hrs))}
            />
            <LabelText no_join>{`/ ${len > 60 * 60 ? Math.floor(len / 60 / 60).toString() + ":" : ""}${Math.floor((len / 60) % 60).toString().padStart(2, "0")}:${Math.floor(len % 60).toString().padStart(2, "0")}`}</LabelText>
        </div>
        <div>
            <Button classes={[STYLE_JOIN_TO_RIGHT]} on_click={() => set_time(Math.max(0, time / 1000 - 60))}>
                -60
            </Button>
            <Button classes={[STYLE_JOIN_TO_RIGHT]} on_click={() => set_time(Math.max(0, time / 1000 - 15))}>
                -15
            </Button>
            <NumberInput
                min={0.0}
                // label={ }
                max={len}
                step={1}
                value={Math.min(Math.floor(time / 1000), len)}
                disabled={current == null}
                classes={[STYLE_JOIN_TO_RIGHT]}
                set_value={set_time}
            />
            <Button classes={[STYLE_JOIN_TO_RIGHT]} on_click={() => set_time(time / 1000 + 15)}>
                +15
            </Button>
            <Button classes={[]} on_click={() => set_time(time / 1000 + 60)}>
                +60
            </Button>
        </div>
    </>)
}


function ControlVideoQueue() {
    const conn = useConnection()
    const [queue, set_queue] = useState(conn.last_received.queue)
    conn.on_queue_change.use_bind(set_queue)
    const [cached, set_cached] = useState(new Map(conn.last_received.cached))
    conn.on_cache_update.use_bind(() => set_cached(new Map(conn.last_received.cached)))

    return (
        <div>{
            queue.map((id, i) => {
                const { title, uploader } = cached.get(id)!
                return (
                    <div key={i}>
                        {`${i.toString().padStart(3, "0")} : "${title}" [${uploader}]`}
                    </div>
                )
            })
        }</div>
    )
}

function ControlVideoCached() {
    const conn = useConnection()
    const [cached, set_cached] = useState([...conn.last_received.cached.entries()])

    conn.on_cache_update.use_bind(useCallback(() => {
        set_cached([...conn.last_received.cached.entries()])
    }, [conn, set_cached]))

    const [search, set_search] = useState("")

    return (
        <div className={styles.cached_videos_list}>

            <TextInput
                label={<LabelText>search</LabelText>}
                value={search}
                set_value={set_search}
            />
            {
                cached.filter(([, info]) => (!info.deleted && !info.failed) && (search == "" ? true : info.title.toLowerCase().includes(search.toLowerCase()) || info.uploader.toLowerCase().includes(search.toLowerCase()))).sort(([, a], [, b]) => (a.loaded ? 1 : 0) - (b.loaded ? 1 : 0)).map(([id, info]) => (
                    <ControlVideoCachedEntry key={id} {...{ id, info }} />
                ))
            }
        </div>
    )
}

function ControlVideoCachedEntry({ id, info }: { id: string, info: SongInfo }) {
    const conn = useConnection()

    return (
        <div className={styles.cached_entry}>
            <Button
                on_click={() => {
                    if (info.loaded) conn.send_req_enqueue(id)
                }}
                disabled={!info.loaded}
                classes={[styles.btn_play]}
            >
                {"\u23F5"}
            </Button>
            <div
                className={styles.cached_entry_info}
                onClick={() => {
                    if (info.loaded) conn.send_req_enqueue(id)
                }}
            >
                <div>
                    {info.title}
                </div>
                <div>
                    {info.uploader}
                </div>
                {info.loaded //&& false
                    ? (<></>)
                    : (<div className={styles.cached_entry_loading}>{"...loading..."}</div>)
                }

            </div>
            <Button
                on_click={() => {
                    alert("TODO, info editor")
                }}
                disabled={!info.loaded}
                classes={[styles.btn_edit]}
            >
                {"⋯"}
            </Button>
        </div>
    )
}


function ControlVideoRequests() {
    const conn = useConnection()
    const [id, set_id] = useState("")

    const submit = useCallback(() => {
        set_id("")
        if (id !== "") {
            const [, id_] = /^(?:https?:\/\/(?:\w+\.)?youtube\.com\/watch\?v=|https?:\/\/(?:\w+\.)?youtu\.be\/)?([a-zA-Z0-9_-]{6}[a-zA-Z0-9_-]+)(?:.*?)$/.exec(id.trim()) ?? [, null]
            if (id_ == null) {
                alert("id was not a valid youtube link")
                return
            }
            conn.send_req_enqueue(id_)
        }
    }, [conn, id])

    return (
        <div>
            <TextInput
                value={id}
                set_value={set_id}
                on_enter={submit}
                classes={[STYLE_JOIN_TO_RIGHT]}
            />
            <Button
                disabled={id === ""}
                on_click={submit}
            >
                request
            </Button>
        </div>
    )
}