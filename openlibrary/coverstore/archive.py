"""Utility to move files from local disk to tar files and update the paths in the db.
"""
import tarfile
import web
import os
import time

from openlibrary.coverstore import config, db
from openlibrary.coverstore.coverlib import find_image_path


# logfile = open('log.txt', 'a')


def log(*args):
    msg = " ".join(args)
    print(msg)
    # print >> logfile, msg
    # logfile.flush()


class TarManager:
    def __init__(self):
        self.tarfiles = {}
        self.tarfiles[''] = (None, None, None)
        self.tarfiles['S'] = (None, None, None)
        self.tarfiles['M'] = (None, None, None)
        self.tarfiles['L'] = (None, None, None)

    def get_tarfile(self, name):
        id = web.numify(name)
        tarname = f"covers_{id[:4]}_{id[4:6]}.tar"

        # for id-S.jpg, id-M.jpg, id-L.jpg
        if '-' in name:
            size = name[len(id + '-') :][0].lower()
            tarname = size + "_" + tarname
        else:
            size = ""

        _tarname, _tarfile, _indexfile = self.tarfiles[size.upper()]
        if _tarname != tarname:
            _tarname and _tarfile.close()
            _tarfile, _indexfile = self.open_tarfile(tarname)
            self.tarfiles[size.upper()] = tarname, _tarfile, _indexfile
            log('writing', tarname)

        return _tarfile, _indexfile

    def open_tarfile(self, name):
        path = os.path.join(config.data_root, "items", name[: -len("_XX.tar")], name)
        dir = os.path.dirname(path)
        if not os.path.exists(dir):
            os.makedirs(dir)

        indexpath = path.replace('.tar', '.index')
        print(indexpath, os.path.exists(path))
        mode = 'a' if os.path.exists(path) else 'w'
        return tarfile.TarFile(path, mode, format=tarfile.USTAR_FORMAT), open(
            indexpath, mode
        )

    def add_file(self, name, filepath, mtime):
        with open(filepath, 'rb') as fileobj:
            tarinfo = tarfile.TarInfo(name)
            tarinfo.mtime = mtime
            tarinfo.size = os.stat(fileobj.name).st_size

            tar, index = self.get_tarfile(name)

            # tar.offset is current size of tar file.
            # Adding 512 bytes for header gives us the
            # starting offset of next file.
            offset = tar.offset + 512

            tar.addfile(tarinfo, fileobj=fileobj)

            index.write(f'{name}\t{offset}\t{tarinfo.size}\n')
            return f"{os.path.basename(tar.name)}:{offset}:{tarinfo.size}"

    def close(self):
        for name, _tarfile, _indexfile in self.tarfiles.values():
            if name:
                _tarfile.close()
                _indexfile.close()


idx = id


def archive(test=True):
    """Move files from local disk to tar files and update the paths in the db."""
    tar_manager = TarManager()

    _db = db.getdb()

    try:
        covers = _db.select(
            'cover',
            where='archived=$f and id>7999999',
            order='id',
            vars={'f': False},
            limit=8000,
        )

        for cover in covers:
            print('archiving', cover)

            files = {
                'filename': web.storage(
                    name="%010d.jpg" % cover.id, filename=cover.filename
                ),
                'filename_s': web.storage(
                    name="%010d-S.jpg" % cover.id, filename=cover.filename_s
                ),
                'filename_m': web.storage(
                    name="%010d-M.jpg" % cover.id, filename=cover.filename_m
                ),
                'filename_l': web.storage(
                    name="%010d-L.jpg" % cover.id, filename=cover.filename_l
                ),
            }

            for file_type in files:
                f = files[file_type]
                files[file_type].path = f.filename and os.path.join(
                    config.data_root, "localdisk", f.filename
                )

            print(files.values())

            if any(
                d.get('path') is None or not os.path.exists(d.get('path'))
                for d in files.values()
            ):
                print("Missing image file for %010d" % cover.id, file=web.debug)
                continue

            if isinstance(cover.created, str):
                from infogami.infobase import utils

                cover.created = utils.parse_datetime(cover.created)

            timestamp = time.mktime(cover.created.timetuple())

            for d in files.values():
                d.newname = tar_manager.add_file(
                    d.name, filepath=d.path, mtime=timestamp
                )

            if not test:
                _db.update(
                    'cover',
                    where="id=$cover.id",
                    archived=True,
                    filename=files['filename'].newname,
                    filename_s=files['filename_s'].newname,
                    filename_m=files['filename_m'].newname,
                    filename_l=files['filename_l'].newname,
                    vars=locals(),
                )

                for d in files.values():
                    print('removing', d.path)
                    os.remove(d.path)

    finally:
        # logfile.close()
        tar_manager.close()
