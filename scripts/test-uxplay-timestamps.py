#!/usr/bin/env python3
"""Exercise the actual render function with a fake playback clock and sink."""
import pathlib
import re
import subprocess
import sys
import tempfile
source = (pathlib.Path(sys.argv[1]) / 'renderers/audio_renderer.c').read_text()
function = re.search(r'void audio_renderer_render_buffer\([^)]*\)\s*\{.*?^\}', source, re.M | re.S).group()
prefix = r'''
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
typedef uint64_t GstClockTime;
typedef struct {uint64_t pts;} GstBuffer;
typedef struct {void *appsrc; int ct;} Renderer;
static Renderer instance={NULL,8}, *renderer=&instance;
static bool render_audio=true, sync=true;
static uint64_t gst_audio_pipeline_base_time=1000000000ULL, clock_now=10000000000ULL;
static int pushed=0;
static void *logger=NULL;
#define GST_SECOND 1000000000ULL
#define SECOND_IN_NSECS GST_SECOND
#define GST_CLOCK_TIME_IS_VALID(x) ((x)!=UINT64_MAX)
#define GST_BUFFER_PTS(x) ((x)->pts)
#define GST_APP_SRC(x) (x)
#define LOGGER_ERR 0
#define g_assert assert
uint64_t gst_element_get_current_clock_time(void *p){return clock_now;}
void logger_log(void *p,int l,const char *f,...){}
GstBuffer *gst_buffer_new_allocate(void *a,int n,void *b){return calloc(1,sizeof(GstBuffer));}
void gst_buffer_fill(GstBuffer *b,int o,void *d,int n){}
void gst_app_src_push_buffer(void *p,GstBuffer *b){pushed++;free(b);}
'''
suffix = r'''
int main(void) {
 unsigned char data[]={0x8c};int size=1;unsigned short seq=1;
 uint64_t pts=clock_now+180000000;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==1);
 pts=clock_now+15442878000000ULL;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==1);
 /* Corrected timestamps must resume immediately after an invalid one. */
 pts=clock_now+180000000;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==2);
 pts=clock_now+5*GST_SECOND;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==3);
 pts++;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==3);
 /* Audio-only ALAC's timing policy remains unchanged. */
 instance.ct=2;data[0]=0x20;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==4);
 instance.ct=8;data[0]=0x8c;sync=false;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==5);
 renderer=NULL;
 audio_renderer_render_buffer(data,&size,&seq,&pts);assert(pushed==5);
 return 0;
}
'''
with tempfile.TemporaryDirectory() as directory:
 p=pathlib.Path(directory)
 (p/'test.c').write_text(prefix+function+suffix)
 subprocess.run(['cc',str(p/'test.c'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('UxPlay timestamps: normal playback, future rejection, recovery, boundary and ALAC checks passed')
