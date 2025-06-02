import subprocess


def run_deploy():
    subprocess.call(['/bin/bash', '/home/kdash-automacaoqa/htdocs/www.automacaoqa.kdash.com.br/deploy.sh'])