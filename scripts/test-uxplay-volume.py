#!/usr/bin/env python3
"""Exercise the actual UxPlay volume functions with lightweight GStreamer stubs."""
import pathlib
import re
import subprocess
import sys
import tempfile

source = (pathlib.Path(sys.argv[1]) / "renderers/audio_renderer.c").read_text()
functions = []
for name in ("audio_renderer_start", "audio_renderer_set_volume"):
    match = re.search(r"void\s+" + name + r"\([^)]*\)\s*\{.*?^\}", source, re.M | re.S)
    if not match:
        raise SystemExit("Cannot locate " + name)
    functions.append(match.group())
prefix = r"""
#include <assert.h>
#include <stddef.h>
#include <stdarg.h>
typedef struct {void *appsrc; void *pipeline; double *volume; int ct;} audio_renderer_t;
static double a=1,b=1,requested_volume=1;
static audio_renderer_t first={0,0,&a,8},second={0,0,&b,2},*renderer_type[]={&first,&second},*renderer=NULL;
static int gst_audio_pipeline_base_time;
static void *logger=NULL;
static const char *format[]={"AAC","ALAC"};
#define LOGGER_INFO 0
#define LOGGER_ERR 1
#define GST_STATE_NULL 0
#define GST_STATE_PLAYING 1
#define GST_APP_SRC(x) (x)
void logger_log(void *p,int l,const char *s,...){}
void get_renderer_type(unsigned char *ct,int *id){*id=*ct==8?0:1;}
void gst_app_src_end_of_stream(void *p){}
void gst_element_set_state(void *p,int s){}
int gst_element_get_base_time(void *p){return 0;}
void g_object_set(double *p,const char *s,double v,void *end){*p=v;}
"""
suffix = r"""
int main() {
    unsigned char ct = 8;
    /* Volume received before SETUP must apply to the first pipeline. */
    audio_renderer_set_volume(.25);
    audio_renderer_start(&ct);
    assert(a == .25);
    /* Switching codecs must preserve an intentional mute. */
    audio_renderer_set_volume(0);
    ct = 2;
    audio_renderer_start(&ct);
    assert(b == 0);
    /* A reused pipeline must receive the newest pre-SETUP volume. */
    renderer = NULL;
    audio_renderer_set_volume(.6);
    audio_renderer_start(&ct);
    assert(b == .6);
    audio_renderer_set_volume(-1);
    assert(b == 0);
    audio_renderer_set_volume(11);
    assert(b == 10);
    return 0;
}
"""
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory)
    (path / "test.c").write_text(prefix + "\n".join(functions) + suffix)
    subprocess.run(["cc", str(path / "test.c"), "-o", str(path / "test")], check=True)
    subprocess.run([str(path / "test")], check=True)
print("UxPlay volume: pre-SETUP, format change, mute, reconnect and limits passed")
